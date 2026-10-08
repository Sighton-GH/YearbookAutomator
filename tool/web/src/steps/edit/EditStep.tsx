import type React from "react";
import { LayoutGrid, Palette, Users } from "lucide-react";
import type { BackgroundMode, Box, PersonRecord, RawParseDebug, TemplateSlots } from "../../api";
import type { Align, FontWeight } from "../../types";
import type { PersistedSessionV1 } from "../../session";
import { TabBar, type TabBarItem } from "../../components/TabBar";
import { LayoutTab } from "./LayoutTab";
import { PeopleTab } from "./PeopleTab";
import { StyleTab } from "./StyleTab";

export type EditTab = "layout" | "people" | "style";

export function EditStep({
  editTab,
  onEditTab,
  editTabReady,
  hideTabs = false,
  skipQuotes,
  skipBabyPhotos,
  // Layout tab
  slots,
  templateSize,
  onSlots,
  previewMode,
  onPreviewMode,
  annotatedPreviewUrl,
  cleanPreviewUrl,
  templatePreviewUrl,
  selectedSlot,
  onSelectedSlot,
  peoplePerSpread,
  parsedSlots,
  rawDebug,
  // People tab
  workspaceId,
  people,
  setPeople,
  pendingPeopleAdjustments,
  onPendingPeopleAdjustments,
  originalPeople,
  setOriginalPeople,
  originalBabyPeople,
  lockedPeople,
  onLockedPeople,
  defaultMugshotFilenames,
  onDefaultMugshotFilenames,
  defaultMugshotRandomize,
  onDefaultMugshotRandomize,
  defaultMugshotAssignments,
  ensureDefaultMugshotEagle,
  defaultQuotes,
  onDefaultQuotes,
  defaultQuotesRandomize,
  onDefaultQuotesRandomize,
  defaultQuoteAssignments,
  defaultQuoteFallback,
  defaultBabyFilename,
  babyBackgroundColor,
  babyBackgroundMode,
  onBabyEditHistoryAdd,
  babyEditorProtectedFilenames,
  babyMaskBox,
  allowInsecureUploads,
  setStatus,
  loading,
  // Style tab
  nameFontFamily,
  nameFontWeight,
  nameFontSize,
  nameAllCaps,
  nameAlign,
  onNameFontFamily,
  onNameFontWeight,
  onNameFontSize,
  onNameAllCaps,
  onNameAlign,
  quoteFontFamily,
  quoteFontWeight,
  quoteFontSize,
  quoteAllCaps,
  quoteAlign,
  onQuoteFontFamily,
  onQuoteFontWeight,
  onQuoteFontSize,
  onQuoteAllCaps,
  onQuoteAlign,
  availableFonts,
  setAvailableFonts,
  customFontUploadEnabled,
}: {
  editTab: EditTab;
  onEditTab: (tab: EditTab) => void;
  editTabReady: (tab: EditTab) => boolean;
  /** When true the internal Layout/People/Style tab bar is suppressed and only the
   *  `editTab` content renders — used by the 5-step flow which promotes each tab to a top-level step. */
  hideTabs?: boolean;
  skipQuotes: boolean;
  skipBabyPhotos: boolean;
  slots: TemplateSlots[];
  templateSize: { width: number; height: number } | null;
  onSlots: (slots: TemplateSlots[]) => void;
  previewMode: "clean" | "annotated";
  onPreviewMode: (mode: "clean" | "annotated") => void;
  annotatedPreviewUrl: string | null;
  cleanPreviewUrl: string | null;
  templatePreviewUrl: string | null;
  selectedSlot: number | null;
  onSelectedSlot: (idx: number | null) => void;
  peoplePerSpread: number;
  parsedSlots: TemplateSlots[];
  rawDebug: RawParseDebug | null;
  workspaceId: string | null;
  people: PersonRecord[];
  setPeople: (p: PersonRecord[]) => void;
  pendingPeopleAdjustments: Record<number, import("../../components/PersonInspector").PersonAdjustment>;
  onPendingPeopleAdjustments: React.Dispatch<React.SetStateAction<Record<number, import("../../components/PersonInspector").PersonAdjustment>>>;
  originalPeople: PersonRecord[] | null;
  setOriginalPeople: (p: PersonRecord[] | null) => void;
  originalBabyPeople: PersonRecord[] | null;
  lockedPeople: Record<number, true>;
  onLockedPeople: React.Dispatch<React.SetStateAction<Record<number, true>>>;
  defaultMugshotFilenames: string[];
  onDefaultMugshotFilenames: React.Dispatch<React.SetStateAction<string[]>>;
  defaultMugshotRandomize: boolean;
  onDefaultMugshotRandomize: (v: boolean) => void;
  defaultMugshotAssignments: Record<number, string>;
  ensureDefaultMugshotEagle: () => Promise<string | null>;
  defaultQuotes: string[];
  onDefaultQuotes: React.Dispatch<React.SetStateAction<string[]>>;
  defaultQuotesRandomize: boolean;
  onDefaultQuotesRandomize: (v: boolean) => void;
  defaultQuoteAssignments: Record<number, string>;
  defaultQuoteFallback: string;
  defaultBabyFilename: string | null;
  babyBackgroundColor: string;
  babyBackgroundMode: BackgroundMode;
  babyEditorProtectedFilenames: string[];
  onBabyEditHistoryAdd: (entry: NonNullable<PersistedSessionV1["babyEditHistory"]>[number]) => void;
  babyMaskBox: Box | null;
  allowInsecureUploads: boolean;
  setStatus: (v: string) => void;
  loading: boolean;
  nameFontFamily: string;
  nameFontWeight: FontWeight;
  nameFontSize: number;
  nameAllCaps: boolean;
  nameAlign: Align;
  onNameFontFamily: (v: string) => void;
  onNameFontWeight: (v: FontWeight) => void;
  onNameFontSize: (v: number) => void;
  onNameAllCaps: (v: boolean) => void;
  onNameAlign: (v: Align) => void;
  quoteFontFamily: string;
  quoteFontWeight: FontWeight;
  quoteFontSize: number;
  quoteAllCaps: boolean;
  quoteAlign: Align;
  onQuoteFontFamily: (v: string) => void;
  onQuoteFontWeight: (v: FontWeight) => void;
  onQuoteFontSize: (v: number) => void;
  onQuoteAllCaps: (v: boolean) => void;
  onQuoteAlign: (v: Align) => void;
  availableFonts: { name: string; filename: string; source?: string }[];
  setAvailableFonts: (fonts: { name: string; filename: string; source?: string }[]) => void;
  customFontUploadEnabled: boolean;
}) {
  const items: TabBarItem<EditTab>[] = [
    { id: "layout", label: "Layout", icon: <LayoutGrid size={15} />, disabled: !editTabReady("layout"), disabledReason: "Parse a template first" },
    { id: "people", label: "People", icon: <Users size={15} />, disabled: !editTabReady("people"), disabledReason: "Ingest the roster first" },
    { id: "style", label: "Style", icon: <Palette size={15} />, disabled: !editTabReady("style"), disabledReason: "Ingest the roster first" },
  ];

  return (
    <div className="stack-4">
      {!hideTabs && (
        <TabBar items={items} active={editTab} onSelect={onEditTab} size="small" ariaLabel="Edit sections" />
      )}

      {editTab === "layout" && (
        <LayoutTab
          slots={slots}
          templateSize={templateSize}
          onSlots={onSlots}
          previewMode={previewMode}
          onPreviewMode={onPreviewMode}
          annotatedPreviewUrl={annotatedPreviewUrl}
          cleanPreviewUrl={cleanPreviewUrl}
          templatePreviewUrl={templatePreviewUrl}
          selectedSlot={selectedSlot}
          onSelectedSlot={onSelectedSlot}
          peoplePerSpread={peoplePerSpread}
          parsedSlots={parsedSlots}
          rawDebug={rawDebug}
        />
      )}

      {editTab === "people" && (
        <PeopleTab
          workspaceId={workspaceId}
          skipQuotes={skipQuotes}
          skipBabyPhotos={skipBabyPhotos}
          people={people}
          setPeople={setPeople}
          pendingPeopleAdjustments={pendingPeopleAdjustments}
          onPendingPeopleAdjustments={onPendingPeopleAdjustments}
          originalPeople={originalPeople}
          setOriginalPeople={setOriginalPeople}
          originalBabyPeople={originalBabyPeople}
          lockedPeople={lockedPeople}
          onLockedPeople={onLockedPeople}
          defaultMugshotFilenames={defaultMugshotFilenames}
          onDefaultMugshotFilenames={onDefaultMugshotFilenames}
          defaultMugshotRandomize={defaultMugshotRandomize}
          onDefaultMugshotRandomize={onDefaultMugshotRandomize}
          defaultMugshotAssignments={defaultMugshotAssignments}
          ensureDefaultMugshotEagle={ensureDefaultMugshotEagle}
          defaultQuotes={defaultQuotes}
          onDefaultQuotes={onDefaultQuotes}
          defaultQuotesRandomize={defaultQuotesRandomize}
          onDefaultQuotesRandomize={onDefaultQuotesRandomize}
          defaultQuoteAssignments={defaultQuoteAssignments}
          defaultQuoteFallback={defaultQuoteFallback}
          defaultBabyFilename={defaultBabyFilename}
          babyBackgroundColor={babyBackgroundColor}
          babyBackgroundMode={babyBackgroundMode}
          onBabyEditHistoryAdd={onBabyEditHistoryAdd}
          babyEditorProtectedFilenames={babyEditorProtectedFilenames}
          babyMaskBox={babyMaskBox}
          allowInsecureUploads={allowInsecureUploads}
          setStatus={setStatus}
          loading={loading}
        />
      )}

      {editTab === "style" && (
        <StyleTab
          skipQuotes={skipQuotes}
          nameFontFamily={nameFontFamily}
          nameFontWeight={nameFontWeight}
          nameFontSize={nameFontSize}
          nameAllCaps={nameAllCaps}
          nameAlign={nameAlign}
          onNameFontFamily={onNameFontFamily}
          onNameFontWeight={onNameFontWeight}
          onNameFontSize={onNameFontSize}
          onNameAllCaps={onNameAllCaps}
          onNameAlign={onNameAlign}
          quoteFontFamily={quoteFontFamily}
          quoteFontWeight={quoteFontWeight}
          quoteFontSize={quoteFontSize}
          quoteAllCaps={quoteAllCaps}
          quoteAlign={quoteAlign}
          onQuoteFontFamily={onQuoteFontFamily}
          onQuoteFontWeight={onQuoteFontWeight}
          onQuoteFontSize={onQuoteFontSize}
          onQuoteAllCaps={onQuoteAllCaps}
          onQuoteAlign={onQuoteAlign}
          workspaceId={workspaceId}
          availableFonts={availableFonts}
          setAvailableFonts={setAvailableFonts}
          customFontUploadEnabled={customFontUploadEnabled}
        />
      )}
    </div>
  );
}
