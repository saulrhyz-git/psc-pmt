"use client";

/**
 * components/UploadZone.tsx
 * -----------------------------------------------------------------------------
 * Drag-and-drop / click-to-browse upload interface for blueprint images and
 * PDFs. Validates file type and size client-side, produces a local preview
 * URL, and hands the raw File back to the parent via onFileSelected.
 * -----------------------------------------------------------------------------
 */

import { useCallback, useRef, useState } from "react";
import { FileUp, FileWarning, Image as ImageIcon, Loader2, UploadCloud, X } from "lucide-react";
import type { SupportedInputMimeType, UploadedFileState } from "@/lib/types";

const ACCEPTED_MIME_TYPES: SupportedInputMimeType[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
];

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

interface UploadZoneProps {
  onFileSelected: (fileState: UploadedFileState) => void;
  isAnalyzing?: boolean;
  currentFile?: UploadedFileState | null;
  onClear?: () => void;
}

export default function UploadZone({ onFileSelected, isAnalyzing, currentFile, onClear }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndEmit = useCallback(
    (file: File | undefined) => {
      setError(null);
      if (!file) return;

      if (!ACCEPTED_MIME_TYPES.includes(file.type as SupportedInputMimeType)) {
        setError("Unsupported file type. Please upload a PNG, JPEG, WEBP image, or a PDF.");
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max size is 20MB.`);
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      onFileSelected({
        file,
        previewUrl,
        mimeType: file.type as SupportedInputMimeType,
      });
    },
    [onFileSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      validateAndEmit(e.dataTransfer.files?.[0]);
    },
    [validateAndEmit]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      validateAndEmit(e.target.files?.[0]);
      // Reset so re-selecting the same file re-triggers onChange.
      e.target.value = "";
    },
    [validateAndEmit]
  );

  if (currentFile) {
    return (
      <div className="w-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100">
            {currentFile.mimeType === "application/pdf" ? (
              <FileUp className="h-6 w-6 text-slate-500" aria-hidden />
            ) : (
              <ImageIcon className="h-6 w-6 text-slate-500" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{currentFile.file.name}</p>
            <p className="text-xs text-slate-500">{(currentFile.file.size / 1024).toFixed(0)} KB</p>
          </div>
          {isAnalyzing ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-indigo-600" aria-hidden />
          ) : (
            onClear && (
              <button
                type="button"
                onClick={onClear}
                className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            )
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={[
          "flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
          isDragging
            ? "border-indigo-500 bg-indigo-50"
            : "border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/50",
        ].join(" ")}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100">
          <UploadCloud className="h-7 w-7 text-indigo-600" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700">
            Drop your blueprint here, or <span className="text-indigo-600 underline">browse</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Hand sketches, floor plans, or architectural drawings — PNG, JPEG, WEBP, or PDF, up to 20MB
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED_MIME_TYPES.join(",")}
          onChange={handleInputChange}
        />
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
