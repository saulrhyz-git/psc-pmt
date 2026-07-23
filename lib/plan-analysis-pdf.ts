/**
 * lib/plan-analysis-pdf.ts
 * -----------------------------------------------------------------------------
 * Renders a saved PlanAnalysisResult into a downloadable PDF report using
 * `pdfkit` (pure JS, no native deps/system libraries — same rationale as the
 * `mupdf` swap for PDF *reading*, but this direction is PDF *writing*).
 *
 * Used exclusively by lib/plan-analysis-store.ts's `createPlanAnalysis`: when
 * a user "Adds to Project" from the AI Plan Analyzer, this report becomes a
 * ReferenceFile in that project's library (see prisma/schema.prisma's
 * ReferenceFile.sourceAnalysisId).
 *
 * Server-only (Node's Buffer, pdfkit) — never import into a "use client" file.
 * -----------------------------------------------------------------------------
 */

import PDFDocument from "pdfkit";
import type { PlanAnalysisResult, VisionProvider } from "./types";
import { formatDimension, formatMetersCentimeters } from "./measurement-utils";
import { formatCurrency } from "./currency-utils";

export interface PlanAnalysisPdfInput {
  projectName: string;
  fileName: string;
  provider: VisionProvider;
  context?: string;
  createdAt: string;
  result: PlanAnalysisResult;
}

const PROVIDER_LABELS: Record<VisionProvider, string> = {
  claude: "Claude",
  gemini: "Google Gemini",
  kimi: "Kimi (Moonshot AI)",
};

/** Builds the PDF report and resolves with its bytes as a Buffer. */
export function buildPlanAnalysisPdf(input: PlanAnalysisPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "letter" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      renderReport(doc, input);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    doc.end();
  });
}

function renderReport(doc: PDFKit.PDFDocument, input: PlanAnalysisPdfInput): void {
  const { result } = input;

  doc.fontSize(18).font("Helvetica-Bold").fillColor("#1e1b4b").text("AI Plan Analysis Report");
  doc.moveDown(0.4);

  doc.fontSize(10).font("Helvetica").fillColor("#475569");
  doc.text(`Project: ${input.projectName}`);
  doc.text(`Source file: ${input.fileName}`);
  doc.text(`Analyzed with: ${PROVIDER_LABELS[input.provider]}`);
  doc.text(`Date: ${new Date(input.createdAt).toLocaleString()}`);

  if (input.context && input.context.trim()) {
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fillColor("#334155").text("Context provided:");
    doc.font("Helvetica").fillColor("#475569").text(input.context.trim());
  }

  doc.moveDown(0.8);
  drawRule(doc);
  doc.moveDown(0.6);

  // --- Layout overview -------------------------------------------------
  sectionHeading(doc, "Layout Overview");
  doc.fontSize(10).font("Helvetica").fillColor("#000").text(result.metadata.layoutDescription);
  doc.moveDown(0.3);
  doc
    .fontSize(10)
    .text(
      `Total area: ${formatDimension(result.metadata.totalArea, { asArea: true })}    Rooms: ${
        result.metadata.totalRoomCount
      }    Stories: ${result.metadata.stories}`
    );
  if (result.metadata.notableFeatures.length > 0) {
    doc.text(`Notable features: ${result.metadata.notableFeatures.join(", ")}`);
  }
  doc.text(`Extraction confidence: ${Math.round(result.overallConfidence * 100)}%`);
  doc.moveDown(0.7);

  // --- Room breakdown ----------------------------------------------------
  sectionHeading(doc, "Room Breakdown");
  result.rooms.forEach((room) => {
    doc.fontSize(10.5).font("Helvetica-Bold").fillColor("#000").text(`${room.name}  (${room.type})`);
    const dims = room.approximateDimensions
      ? `   Approx: ${formatMetersCentimeters(room.approximateDimensions.width)} x ${formatMetersCentimeters(room.approximateDimensions.length)}`
      : "";
    doc
      .fontSize(9.5)
      .font("Helvetica")
      .fillColor("#334155")
      .text(`Area: ${formatDimension(room.area, { asArea: true })}   Perimeter: ${formatDimension(room.perimeter)}${dims}`);
    if (room.notes) {
      doc.fontSize(9).fillColor("#64748b").text(room.notes);
    }
    doc.moveDown(0.35);
  });
  doc.moveDown(0.4);

  // --- Space planning review ---------------------------------------------
  if (result.spacePlanningComments.length > 0) {
    sectionHeading(doc, "Space Planning Review");
    result.spacePlanningComments.forEach((c) => {
      doc
        .fontSize(9.5)
        .font("Helvetica-Bold")
        .fillColor(severityColor(c.severity))
        .text(`[${c.severity.toUpperCase()}] ${c.title}`);
      doc.font("Helvetica").fillColor("#334155").text(c.description);
      if (c.recommendation) {
        doc.fillColor("#4338ca").text(`Recommendation: ${c.recommendation}`);
      }
      doc.moveDown(0.3);
    });
    doc.moveDown(0.4);
  }

  // --- Furniture suggestions ----------------------------------------------
  if (result.furnitureSuggestions.length > 0) {
    sectionHeading(doc, "Furniture Suggestions");
    result.furnitureSuggestions.forEach((f) => {
      const footprint = `${formatMetersCentimeters(f.footprint.width)} x ${formatMetersCentimeters(f.footprint.length)}`;
      doc
        .fontSize(9.5)
        .font("Helvetica")
        .fillColor("#000")
        .text(`${f.label} — ${footprint}${f.rationale ? `  (${f.rationale})` : ""}`);
    });
    doc.moveDown(0.5);
  }

  // --- Material & cost estimate --------------------------------------------
  if (result.materialEstimate) {
    sectionHeading(doc, "Material & Cost Estimate");
    result.materialEstimate.lineItems.forEach((li) => {
      doc
        .fontSize(9.5)
        .font("Helvetica")
        .fillColor("#000")
        .text(`${li.label}: ${li.quantity} ${li.unit} @ ${formatCurrency(li.unitCost)}  =  ${formatCurrency(li.total)}`);
    });
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold");
    doc.text(`Subtotal: ${formatCurrency(result.materialEstimate.subtotal)}`);
    doc.text(
      `Contingency (${Math.round(result.materialEstimate.contingencyPercent * 100)}%): ${formatCurrency(
        result.materialEstimate.contingencyAmount
      )}`
    );
    doc.text(`Total: ${formatCurrency(result.materialEstimate.total)}`);
    doc.moveDown(0.5);
  }

  // --- Warnings ------------------------------------------------------------
  if (result.warnings.length > 0) {
    sectionHeading(doc, "Warnings", "#b45309");
    doc.fontSize(9).font("Helvetica").fillColor("#92400e");
    result.warnings.forEach((w) => doc.text(`•  ${w}`));
  }
}

function sectionHeading(doc: PDFKit.PDFDocument, text: string, color = "#312e81"): void {
  doc.moveDown(0.2);
  doc.fontSize(13).font("Helvetica-Bold").fillColor(color).text(text);
  doc.moveDown(0.25);
  doc.fillColor("#000");
}

function drawRule(doc: PDFKit.PDFDocument): void {
  const y = doc.y;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .strokeColor("#e2e8f0")
    .stroke();
}

function severityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "#b91c1c";
    case "warning":
      return "#b45309";
    case "suggestion":
      return "#4338ca";
    default:
      return "#334155";
  }
}
