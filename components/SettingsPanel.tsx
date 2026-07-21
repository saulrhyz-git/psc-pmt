/**
 * components/SettingsPanel.tsx
 * -----------------------------------------------------------------------------
 * DEPRECATED / UNUSED. This modal-based Settings panel was replaced when
 * Settings was promoted from a gear-icon modal to a full sidebar tab
 * ("Settings & Templates" — see app/page.tsx, components/Sidebar.tsx, and
 * components/settings-templates/SettingsTemplatesTool.tsx). Its logic now
 * lives in components/settings-templates/AiProviderSettings.tsx (no modal
 * chrome) plus the existing components/UserManagement.tsx, composed inside
 * SettingsTemplatesTool's "Settings" sub-tab.
 *
 * This file is kept as an empty, harmless no-op (rather than deleted)
 * because this environment couldn't remove it (same constraint noted in
 * types/pdfjs-worker.d.ts). It has no effect on the build — nothing imports
 * it anymore.
 * -----------------------------------------------------------------------------
 */
export {};
