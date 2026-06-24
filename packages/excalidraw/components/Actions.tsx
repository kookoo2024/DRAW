import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { Popover } from "radix-ui";

import {
  CLASSES,
  KEYS,
  capitalizeString,
  isTransparent,
} from "@excalidraw/common";

import {
  shouldAllowVerticalAlign,
  suppportsHorizontalAlign,
  hasBoundTextElement,
  isElbowArrow,
  isImageElement,
  isLinearElement,
  isTextElement,
  isArrowElement,
  hasStrokeColor,
  toolIsArrow,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawElementType,
  NonDeletedElementsMap,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";

import { actionToggleZenMode } from "../actions";

import { alignActionsPredicate } from "../actions/actionAlign";
import { trackEvent } from "../analytics";
import { useTunnels } from "../context/tunnels";

import { t } from "../i18n";
import {
  canChangeRoundness,
  canHaveArrowheads,
  getTargetElements,
  hasBackground,
  hasStrokeStyle,
  hasStrokeWidth,
} from "../scene";

import { getFormValue } from "../actions/actionProperties";
import {
  actionChangeStrokeColor,
  actionChangeStrokeStyle,
} from "../actions/actionProperties";
import { actionDeleteSelected } from "../actions";

import { useTextEditorFocus } from "../hooks/useTextEditorFocus";

import { actionToggleViewMode } from "../actions/actionToggleViewMode";

import { getToolbarTools } from "./shapes";

import "./Actions.scss";

import {
  useEditorInterface,
  useStylesPanelMode,
  useExcalidrawContainer,
  useExcalidrawActionManager,
} from "./App";
import Stack from "./Stack";
import { ToolButton } from "./ToolButton";
import { ToolPopover } from "./ToolPopover";
import { Tooltip } from "./Tooltip";
import DropdownMenu from "./dropdownMenu/DropdownMenu";
import { PropertiesPopover } from "./PropertiesPopover";
import {
  EmbedIcon,
  extraToolsIcon,
  frameToolIcon,
  mermaidLogoIcon,
  laserPointerToolIcon,
  MagicIcon,
  LassoIcon,
  sharpArrowIcon,
  roundArrowIcon,
  elbowArrowIcon,
  TextSizeIcon,
  adjustmentsIcon,
  DotsHorizontalIcon,
  EraserIcon,
  TrashIcon,
  SelectionIcon,
  pencilIcon,
  DiamondIcon,
  RectangleIcon,
  EllipseIcon,
  TriangleShapeIcon,
  ArrowIcon,
  TextIcon,
  ImageIcon,
  LockedIcon,
  UnlockedIcon,
} from "./icons";

import { Island } from "./Island";

import type {
  AppClassProperties,
  AppProps,
  UIAppState,
  Zoom,
  AppState,
} from "../types";
import type { ActionManager } from "../actions/manager";

// Common CSS class combinations
const PROPERTIES_CLASSES = clsx([
  CLASSES.SHAPE_ACTIONS_THEME_SCOPE,
  "properties-content",
]);

export const canChangeStrokeColor = (
  appState: UIAppState,
  targetElements: ExcalidrawElement[],
) => {
  let commonSelectedType: ExcalidrawElementType | null =
    targetElements[0]?.type || null;

  for (const element of targetElements) {
    if (element.type !== commonSelectedType) {
      commonSelectedType = null;
      break;
    }
  }

  return (
    (hasStrokeColor(appState.activeTool.type) &&
      commonSelectedType !== "image" &&
      commonSelectedType !== "frame" &&
      commonSelectedType !== "magicframe") ||
    targetElements.some((element) => hasStrokeColor(element.type))
  );
};

export const canChangeBackgroundColor = (
  appState: UIAppState,
  targetElements: ExcalidrawElement[],
) => {
  return (
    hasBackground(appState.activeTool.type) ||
    targetElements.some((element) => hasBackground(element.type))
  );
};

export const SelectedShapeActions = ({
  appState,
  elementsMap,
  renderAction,
  app,
}: {
  appState: UIAppState;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
  renderAction: ActionManager["renderAction"];
  app: AppClassProperties;
}) => {
  const targetElements = getTargetElements(elementsMap, appState);

  let isSingleElementBoundContainer = false;
  if (
    targetElements.length === 2 &&
    (hasBoundTextElement(targetElements[0]) ||
      hasBoundTextElement(targetElements[1]))
  ) {
    isSingleElementBoundContainer = true;
  }
  const isEditingTextOrNewElement = Boolean(
    appState.editingTextElement || appState.newElement,
  );
  const editorInterface = useEditorInterface();
  const isRTL = document.documentElement.getAttribute("dir") === "rtl";

  const showFillIcons =
    (hasBackground(appState.activeTool.type) &&
      !isTransparent(appState.currentItemBackgroundColor)) ||
    targetElements.some(
      (element) =>
        hasBackground(element.type) && !isTransparent(element.backgroundColor),
    );

  const showLinkIcon =
    targetElements.length === 1 || isSingleElementBoundContainer;

  const showLineEditorAction =
    !appState.selectedLinearElement?.isEditing &&
    targetElements.length === 1 &&
    isLinearElement(targetElements[0]) &&
    !isElbowArrow(targetElements[0]);

  const showCropEditorAction =
    !appState.croppingElementId &&
    targetElements.length === 1 &&
    isImageElement(targetElements[0]);

  const showAlignActions =
    !isSingleElementBoundContainer && alignActionsPredicate(appState, app);

  return (
    <div className="selected-shape-actions">
      {/* 常驻显示：描边色 + 描边宽度 + 描边样式（核心三项） */}
      <div>
        {canChangeStrokeColor(appState, targetElements) &&
          renderAction("changeStrokeColor")}
      </div>

      {(hasStrokeWidth(appState.activeTool.type) ||
        targetElements.some((element) => hasStrokeWidth(element.type))) &&
        renderAction("changeStrokeWidth")}

      {/* 边框样式（实线/虚线/点线）常驻 */}
      {(hasStrokeStyle(appState.activeTool.type) ||
        targetElements.some((element) => hasStrokeStyle(element.type))) &&
        renderAction("changeStrokeStyle")}

      {(appState.activeTool.type === "text" ||
        targetElements.some(isTextElement)) && (
        <>
          <fieldset>{renderAction("changeFontFamily")}</fieldset>
          {renderAction("changeFontSize")}
          {(appState.activeTool.type === "text" ||
            suppportsHorizontalAlign(targetElements, elementsMap)) &&
            renderAction("changeTextAlign")}
        </>
      )}

      {(canHaveArrowheads(appState.activeTool.type) ||
        targetElements.some((element) => canHaveArrowheads(element.type))) && (
        <>{renderAction("changeArrowhead")}</>
      )}

      {/* 折叠区：线条风格 + 背景 + 边角 + 透明度 + 图层 + 对齐 + 动作（默认收起，点击展开）*/}
      <details className="selected-shape-actions__more">
        <summary>更多</summary>

        {/* 粗糙度（手绘感）折叠 */}
        {(hasStrokeStyle(appState.activeTool.type) ||
          targetElements.some((element) => hasStrokeStyle(element.type))) &&
          renderAction("changeSloppiness")}

        {/* 背景色 + 填充 */}
        {canChangeBackgroundColor(appState, targetElements) && (
          <div>{renderAction("changeBackgroundColor")}</div>
        )}
        {showFillIcons && renderAction("changeFillStyle")}

        {(canChangeRoundness(appState.activeTool.type) ||
          targetElements.some((element) => canChangeRoundness(element.type))) && (
          <>{renderAction("changeRoundness")}</>
        )}

        {(appState.activeTool.type === "freedraw" ||
          targetElements.some((element) => element.type === "freedraw")) &&
          renderAction("changeStrokeShape")}

        {(toolIsArrow(appState.activeTool.type) ||
          targetElements.some((element) => toolIsArrow(element.type))) && (
          <>{renderAction("changeArrowType")}</>
        )}

        {shouldAllowVerticalAlign(targetElements, elementsMap) &&
          renderAction("changeVerticalAlign")}

        {renderAction("changeOpacity")}

        <fieldset>
          <legend>{t("labels.layers")}</legend>
          <div className="buttonList">
            {/* 图层只留：下一层 + 上一层 */}
            {renderAction("sendBackward")}
            {renderAction("bringForward")}
          </div>
        </fieldset>

        {showAlignActions && !isSingleElementBoundContainer && (
          <fieldset>
            <legend>{t("labels.align")}</legend>
            <div className="buttonList">
              {isRTL ? (
                <>
                  {renderAction("alignRight")}
                  {renderAction("alignHorizontallyCentered")}
                  {renderAction("alignLeft")}
                </>
              ) : (
                <>
                  {renderAction("alignLeft")}
                  {renderAction("alignHorizontallyCentered")}
                  {renderAction("alignRight")}
                </>
              )}
              {targetElements.length > 2 &&
                renderAction("distributeHorizontally")}
              {/* breaks the row ˇˇ */}
              <div style={{ flexBasis: "100%", height: 0 }} />
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: ".5rem",
                  marginTop: "-0.5rem",
                }}
              >
                {renderAction("alignTop")}
                {renderAction("alignVerticallyCentered")}
                {renderAction("alignBottom")}
                {targetElements.length > 2 &&
                  renderAction("distributeVertically")}
              </div>
            </div>
          </fieldset>
        )}
        {!isEditingTextOrNewElement && targetElements.length > 0 && (
          <fieldset>
            <legend>{t("labels.actions")}</legend>
            <div className="buttonList">
              {editorInterface.formFactor !== "phone" &&
                renderAction("duplicateSelection")}
              {editorInterface.formFactor !== "phone" &&
                renderAction("deleteSelectedElements")}
              {renderAction("group")}
              {renderAction("ungroup")}
              {showLinkIcon && renderAction("hyperlink")}
              {showCropEditorAction && renderAction("cropEditor")}
              {showLineEditorAction && renderAction("toggleLinearEditor")}
            </div>
          </fieldset>
        )}
      </details>
    </div>
  );
};

const CombinedShapeProperties = ({
  appState,
  renderAction,
  setAppState,
  targetElements,
  container,
}: {
  targetElements: ExcalidrawElement[];
  appState: UIAppState;
  renderAction: ActionManager["renderAction"];
  setAppState: React.Component<any, AppState>["setState"];
  container: HTMLDivElement | null;
}) => {
  const showFillIcons =
    (hasBackground(appState.activeTool.type) &&
      !isTransparent(appState.currentItemBackgroundColor)) ||
    targetElements.some(
      (element) =>
        hasBackground(element.type) && !isTransparent(element.backgroundColor),
    );

  const shouldShowCombinedProperties =
    targetElements.length > 0 ||
    (appState.activeTool.type !== "selection" &&
      appState.activeTool.type !== "eraser" &&
      appState.activeTool.type !== "hand" &&
      appState.activeTool.type !== "laser" &&
      appState.activeTool.type !== "lasso");
  const isOpen = appState.openPopup === "compactStrokeStyles";

  if (!shouldShowCombinedProperties) {
    return null;
  }

  return (
    <div className="compact-action-item">
      <Popover.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            setAppState({ openPopup: "compactStrokeStyles" });
          } else {
            setAppState({ openPopup: null });
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={clsx("compact-action-button properties-trigger", {
              active: isOpen,
            })}
            title={t("labels.stroke")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();

              setAppState({
                openPopup: isOpen ? null : "compactStrokeStyles",
              });
            }}
          >
            {adjustmentsIcon}
          </button>
        </Popover.Trigger>
        {isOpen && (
          <PropertiesPopover
            className={PROPERTIES_CLASSES}
            container={container}
            style={{ maxWidth: "13rem" }}
            onClose={() => {}}
          >
            <div className="selected-shape-actions">
              {showFillIcons && renderAction("changeFillStyle")}
              {(hasStrokeWidth(appState.activeTool.type) ||
                targetElements.some((element) =>
                  hasStrokeWidth(element.type),
                )) &&
                renderAction("changeStrokeWidth")}
              {(hasStrokeStyle(appState.activeTool.type) ||
                targetElements.some((element) =>
                  hasStrokeStyle(element.type),
                )) && (
                <>
                  {renderAction("changeStrokeStyle")}
                  {renderAction("changeSloppiness")}
                </>
              )}
              {(canChangeRoundness(appState.activeTool.type) ||
                targetElements.some((element) =>
                  canChangeRoundness(element.type),
                )) &&
                renderAction("changeRoundness")}
              {renderAction("changeOpacity")}
            </div>
          </PropertiesPopover>
        )}
      </Popover.Root>
    </div>
  );
};

const CombinedArrowProperties = ({
  appState,
  renderAction,
  setAppState,
  targetElements,
  container,
  app,
}: {
  targetElements: ExcalidrawElement[];
  appState: UIAppState;
  renderAction: ActionManager["renderAction"];
  setAppState: React.Component<any, AppState>["setState"];
  container: HTMLDivElement | null;
  app: AppClassProperties;
}) => {
  const showShowArrowProperties =
    toolIsArrow(appState.activeTool.type) ||
    targetElements.some((element) => toolIsArrow(element.type));
  const isOpen = appState.openPopup === "compactArrowProperties";

  if (!showShowArrowProperties) {
    return null;
  }

  return (
    <div className="compact-action-item">
      <Popover.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            setAppState({ openPopup: "compactArrowProperties" });
          } else {
            setAppState({ openPopup: null });
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={clsx("compact-action-button properties-trigger", {
              active: isOpen,
            })}
            title={t("labels.arrowtypes")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();

              setAppState({
                openPopup: isOpen ? null : "compactArrowProperties",
              });
            }}
          >
            {(() => {
              // Show an icon based on the current arrow type
              const arrowType = getFormValue(
                targetElements,
                app,
                (element) => {
                  if (isArrowElement(element)) {
                    return element.elbowed
                      ? "elbow"
                      : element.roundness
                      ? "round"
                      : "sharp";
                  }
                  return null;
                },
                (element) => isArrowElement(element),
                (hasSelection) =>
                  hasSelection ? null : appState.currentItemArrowType,
              );

              if (arrowType === "elbow") {
                return elbowArrowIcon;
              }
              if (arrowType === "round") {
                return roundArrowIcon;
              }
              return sharpArrowIcon;
            })()}
          </button>
        </Popover.Trigger>
        {isOpen && (
          <PropertiesPopover
            container={container}
            className="properties-content"
            style={{ maxWidth: "13rem" }}
            onClose={() => {}}
          >
            {renderAction("changeArrowProperties")}
          </PropertiesPopover>
        )}
      </Popover.Root>
    </div>
  );
};

const CombinedTextProperties = ({
  appState,
  renderAction,
  setAppState,
  targetElements,
  container,
  elementsMap,
}: {
  appState: UIAppState;
  renderAction: ActionManager["renderAction"];
  setAppState: React.Component<any, AppState>["setState"];
  targetElements: ExcalidrawElement[];
  container: HTMLDivElement | null;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
}) => {
  const { saveCaretPosition, restoreCaretPosition } = useTextEditorFocus();
  const isOpen = appState.openPopup === "compactTextProperties";

  return (
    <div className="compact-action-item">
      <Popover.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            if (appState.editingTextElement) {
              saveCaretPosition();
            }
            setAppState({ openPopup: "compactTextProperties" });
          } else {
            setAppState({ openPopup: null });
            if (appState.editingTextElement) {
              restoreCaretPosition();
            }
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={clsx("compact-action-button properties-trigger", {
              active: isOpen,
            })}
            title={t("labels.textAlign")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();

              if (isOpen) {
                setAppState({ openPopup: null });
              } else {
                if (appState.editingTextElement) {
                  saveCaretPosition();
                }
                setAppState({ openPopup: "compactTextProperties" });
              }
            }}
          >
            {TextSizeIcon}
          </button>
        </Popover.Trigger>
        {appState.openPopup === "compactTextProperties" && (
          <PropertiesPopover
            className={PROPERTIES_CLASSES}
            container={container}
            style={{ maxWidth: "13rem" }}
            // Improve focus handling for text editing scenarios
            preventAutoFocusOnTouch={!!appState.editingTextElement}
            onClose={() => {
              // Refocus text editor when popover closes with caret restoration
              if (appState.editingTextElement) {
                restoreCaretPosition();
              }
            }}
          >
            <div className="selected-shape-actions">
              {(appState.activeTool.type === "text" ||
                targetElements.some(isTextElement)) &&
                renderAction("changeFontSize")}
              {(appState.activeTool.type === "text" ||
                suppportsHorizontalAlign(targetElements, elementsMap)) &&
                renderAction("changeTextAlign")}
              {shouldAllowVerticalAlign(targetElements, elementsMap) &&
                renderAction("changeVerticalAlign")}
            </div>
          </PropertiesPopover>
        )}
      </Popover.Root>
    </div>
  );
};

const CombinedExtraActions = ({
  appState,
  renderAction,
  targetElements,
  setAppState,
  container,
  app,
  showDuplicate,
  showDelete,
}: {
  appState: UIAppState;
  targetElements: ExcalidrawElement[];
  renderAction: ActionManager["renderAction"];
  setAppState: React.Component<any, AppState>["setState"];
  container: HTMLDivElement | null;
  app: AppClassProperties;
  showDuplicate?: boolean;
  showDelete?: boolean;
}) => {
  const isEditingTextOrNewElement = Boolean(
    appState.editingTextElement || appState.newElement,
  );
  const showCropEditorAction =
    !appState.croppingElementId &&
    targetElements.length === 1 &&
    isImageElement(targetElements[0]);
  const showLinkIcon = targetElements.length === 1;
  const showAlignActions = alignActionsPredicate(appState, app);
  let isSingleElementBoundContainer = false;
  if (
    targetElements.length === 2 &&
    (hasBoundTextElement(targetElements[0]) ||
      hasBoundTextElement(targetElements[1]))
  ) {
    isSingleElementBoundContainer = true;
  }

  const isRTL = document.documentElement.getAttribute("dir") === "rtl";
  const isOpen = appState.openPopup === "compactOtherProperties";

  if (isEditingTextOrNewElement || targetElements.length === 0) {
    return null;
  }

  return (
    <div className="compact-action-item">
      <Popover.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            setAppState({ openPopup: "compactOtherProperties" });
          } else {
            setAppState({ openPopup: null });
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={clsx("compact-action-button properties-trigger", {
              active: isOpen,
            })}
            title={t("labels.actions")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setAppState({
                openPopup: isOpen ? null : "compactOtherProperties",
              });
            }}
          >
            {DotsHorizontalIcon}
          </button>
        </Popover.Trigger>
        {isOpen && (
          <PropertiesPopover
            className={PROPERTIES_CLASSES}
            container={container}
            style={{
              maxWidth: "12rem",
              justifyContent: "center",
              alignItems: "center",
            }}
            onClose={() => {}}
          >
            <div className="selected-shape-actions">
              <fieldset>
                <legend>{t("labels.layers")}</legend>
                <div className="buttonList">
                  {renderAction("sendToBack")}
                  {renderAction("sendBackward")}
                  {renderAction("bringForward")}
                  {renderAction("bringToFront")}
                </div>
              </fieldset>

              {showAlignActions && !isSingleElementBoundContainer && (
                <fieldset>
                  <legend>{t("labels.align")}</legend>
                  <div className="buttonList">
                    {isRTL ? (
                      <>
                        {renderAction("alignRight")}
                        {renderAction("alignHorizontallyCentered")}
                        {renderAction("alignLeft")}
                      </>
                    ) : (
                      <>
                        {renderAction("alignLeft")}
                        {renderAction("alignHorizontallyCentered")}
                        {renderAction("alignRight")}
                      </>
                    )}
                    {targetElements.length > 2 &&
                      renderAction("distributeHorizontally")}
                    {/* breaks the row ˇˇ */}
                    <div style={{ flexBasis: "100%", height: 0 }} />
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: ".5rem",
                        marginTop: "-0.5rem",
                      }}
                    >
                      {renderAction("alignTop")}
                      {renderAction("alignVerticallyCentered")}
                      {renderAction("alignBottom")}
                      {targetElements.length > 2 &&
                        renderAction("distributeVertically")}
                    </div>
                  </div>
                </fieldset>
              )}
              <fieldset>
                <legend>{t("labels.actions")}</legend>
                <div className="buttonList">
                  {renderAction("group")}
                  {renderAction("ungroup")}
                  {showLinkIcon && renderAction("hyperlink")}
                  {showCropEditorAction && renderAction("cropEditor")}
                  {showDuplicate && renderAction("duplicateSelection")}
                  {showDelete && renderAction("deleteSelectedElements")}
                </div>
              </fieldset>
            </div>
          </PropertiesPopover>
        )}
      </Popover.Root>
    </div>
  );
};

const LinearEditorAction = ({
  appState,
  renderAction,
  targetElements,
}: {
  appState: UIAppState;
  targetElements: ExcalidrawElement[];
  renderAction: ActionManager["renderAction"];
}) => {
  const showLineEditorAction =
    !appState.selectedLinearElement?.isEditing &&
    targetElements.length === 1 &&
    isLinearElement(targetElements[0]) &&
    !isElbowArrow(targetElements[0]);

  if (!showLineEditorAction) {
    return null;
  }

  return (
    <div className="compact-action-item">
      {renderAction("toggleLinearEditor")}
    </div>
  );
};

export const CompactShapeActions = ({
  appState,
  elementsMap,
  renderAction,
  app,
  setAppState,
}: {
  appState: UIAppState;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
  renderAction: ActionManager["renderAction"];
  app: AppClassProperties;
  setAppState: React.Component<any, AppState>["setState"];
}) => {
  const targetElements = getTargetElements(elementsMap, appState);
  const { container } = useExcalidrawContainer();

  const isEditingTextOrNewElement = Boolean(
    appState.editingTextElement || appState.newElement,
  );

  const showLineEditorAction =
    !appState.selectedLinearElement?.isEditing &&
    targetElements.length === 1 &&
    isLinearElement(targetElements[0]) &&
    !isElbowArrow(targetElements[0]);

  return (
    <div className="compact-shape-actions">
      {/* Stroke Color */}
      {canChangeStrokeColor(appState, targetElements) && (
        <div className={clsx("compact-action-item")}>
          {renderAction("changeStrokeColor")}
        </div>
      )}

      {/* Background Color */}
      {canChangeBackgroundColor(appState, targetElements) && (
        <div className="compact-action-item">
          {renderAction("changeBackgroundColor")}
        </div>
      )}

      <CombinedShapeProperties
        appState={appState}
        renderAction={renderAction}
        setAppState={setAppState}
        targetElements={targetElements}
        container={container}
      />

      <CombinedArrowProperties
        appState={appState}
        renderAction={renderAction}
        setAppState={setAppState}
        targetElements={targetElements}
        container={container}
        app={app}
      />
      {/* Linear Editor */}
      {showLineEditorAction && (
        <div className="compact-action-item">
          {renderAction("toggleLinearEditor")}
        </div>
      )}

      {/* Text Properties */}
      {(appState.activeTool.type === "text" ||
        targetElements.some(isTextElement)) && (
        <>
          <div className="compact-action-item">
            {renderAction("changeFontFamily")}
          </div>
          <CombinedTextProperties
            appState={appState}
            renderAction={renderAction}
            setAppState={setAppState}
            targetElements={targetElements}
            container={container}
            elementsMap={elementsMap}
          />
        </>
      )}

      {/* Dedicated Copy Button */}
      {!isEditingTextOrNewElement && targetElements.length > 0 && (
        <div className="compact-action-item">
          {renderAction("duplicateSelection")}
        </div>
      )}

      {/* Dedicated Delete Button */}
      {!isEditingTextOrNewElement && targetElements.length > 0 && (
        <div className="compact-action-item">
          {renderAction("deleteSelectedElements")}
        </div>
      )}

      <CombinedExtraActions
        appState={appState}
        renderAction={renderAction}
        targetElements={targetElements}
        setAppState={setAppState}
        container={container}
        app={app}
      />
    </div>
  );
};

export const MobileShapeActions = ({
  appState,
  elementsMap,
  renderAction,
  app,
  setAppState,
}: {
  appState: UIAppState;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
  renderAction: ActionManager["renderAction"];
  app: AppClassProperties;
  setAppState: React.Component<any, AppState>["setState"];
}) => {
  const targetElements = getTargetElements(elementsMap, appState);
  const { container } = useExcalidrawContainer();
  const mobileActionsRef = useRef<HTMLDivElement>(null);

  const ACTIONS_WIDTH =
    mobileActionsRef.current?.getBoundingClientRect()?.width ?? 0;

  // 7 actions + 2 for undo/redo
  const MIN_ACTIONS = 9;

  const GAP = 6;
  const WIDTH = 32;

  const MIN_WIDTH = MIN_ACTIONS * WIDTH + (MIN_ACTIONS - 1) * GAP;

  const ADDITIONAL_WIDTH = WIDTH + GAP;

  const showDeleteOutside = ACTIONS_WIDTH >= MIN_WIDTH + ADDITIONAL_WIDTH;
  const showDuplicateOutside =
    ACTIONS_WIDTH >= MIN_WIDTH + 2 * ADDITIONAL_WIDTH;

  return (
    <Island
      className="compact-shape-actions mobile-shape-actions"
      style={{
        flexDirection: "row",
        boxShadow: "none",
        padding: 0,
        zIndex: 2,
        backgroundColor: "transparent",
        height: WIDTH * 1.35,
        marginBottom: 4,
        alignItems: "center",
        gap: GAP,
        pointerEvents: "none",
      }}
      ref={mobileActionsRef}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: GAP,
          flex: 1,
        }}
      >
        {canChangeStrokeColor(appState, targetElements) && (
          <div className={clsx("compact-action-item")}>
            {renderAction("changeStrokeColor")}
          </div>
        )}
        {canChangeBackgroundColor(appState, targetElements) && (
          <div className="compact-action-item">
            {renderAction("changeBackgroundColor")}
          </div>
        )}
        <CombinedShapeProperties
          appState={appState}
          renderAction={renderAction}
          setAppState={setAppState}
          targetElements={targetElements}
          container={container}
        />
        {/* Combined Arrow Properties */}
        <CombinedArrowProperties
          appState={appState}
          renderAction={renderAction}
          setAppState={setAppState}
          targetElements={targetElements}
          container={container}
          app={app}
        />
        {/* Linear Editor */}
        <LinearEditorAction
          appState={appState}
          renderAction={renderAction}
          targetElements={targetElements}
        />
        {/* Text Properties */}
        {(appState.activeTool.type === "text" ||
          targetElements.some(isTextElement)) && (
          <>
            <div className="compact-action-item">
              {renderAction("changeFontFamily")}
            </div>
            <CombinedTextProperties
              appState={appState}
              renderAction={renderAction}
              setAppState={setAppState}
              targetElements={targetElements}
              container={container}
              elementsMap={elementsMap}
            />
          </>
        )}

        {/* Combined Other Actions */}
        <CombinedExtraActions
          appState={appState}
          renderAction={renderAction}
          targetElements={targetElements}
          setAppState={setAppState}
          container={container}
          app={app}
          showDuplicate={!showDuplicateOutside}
          showDelete={!showDeleteOutside}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: GAP,
        }}
      >
        <div className="compact-action-item">{renderAction("undo")}</div>
        <div className="compact-action-item">{renderAction("redo")}</div>
        {showDuplicateOutside && (
          <div className="compact-action-item">
            {renderAction("duplicateSelection")}
          </div>
        )}
        {showDeleteOutside && (
          <div className="compact-action-item">
            {renderAction("deleteSelectedElements")}
          </div>
        )}
      </div>
    </Island>
  );
};

// 橡皮擦 + 删除 复合按钮（参照形状复合按钮 ToolPopover 的视觉风格）
// - 主按钮：始终显示橡皮擦图标；橡皮擦工具激活时高亮
// - 点击主按钮：仅展开/收起菜单，不改工具状态、不清除选中
//   （注意：不能像形状按钮那样在点击时激活橡皮擦——setActiveTool 对非选择类工具
//    会清空 selectedElementIds，会破坏后续「删除」的可用性）
// - 菜单选项：橡皮擦（切换到橡皮擦工具）/ 删除（执行删除选中元素）
// 不改变原有橡皮擦工具与删除动作的任何逻辑，仅做 UI 合并
const EraserDeletePopover = ({
  app,
  activeTool,
}: {
  app: AppClassProperties;
  activeTool: UIAppState["activeTool"];
}) => {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const actionManager = useExcalidrawActionManager();
  const { container } = useExcalidrawContainer();
  const SIDE_OFFSET = 32 / 2 + 10;

  // 画布交互时收起菜单（与 ToolPopover 行为一致）
  useEffect(() => {
    const unsubscribe = app.onPointerDownEmitter?.on(() => {
      setIsPopupOpen(false);
    });
    return () => unsubscribe?.();
  }, [app]);

  const eraserActive = activeTool.type === "eraser";

  const deleteSelected = () => {
    actionManager.executeAction(actionDeleteSelected, "ui");
  };

  const selectEraser = () => {
    trackEvent("toolbar", "eraser", "ui");
    app.setActiveTool({ type: "eraser" });
  };

  return (
    <Popover.Root open={isPopupOpen}>
      <Popover.Trigger asChild>
        <ToolButton
          className={clsx("Shape", { fillable: false })}
          type="radio"
          icon={EraserIcon}
          checked={eraserActive}
          name="editor-current-shape"
          title={capitalizeString(t("toolBar.eraser"))}
          aria-label={capitalizeString(t("toolBar.eraser"))}
          data-testid="toolbar-eraser-delete"
          onPointerDown={() => {
            // 仅切换菜单：不调用 setActiveTool，保留当前选中，
            // 确保「删除」选项始终基于真实选中状态生效
            setIsPopupOpen((v) => !v);
          }}
        />
      </Popover.Trigger>

      <Popover.Content
        className="tool-popover-content"
        sideOffset={SIDE_OFFSET}
        collisionBoundary={container ?? undefined}
      >
        <ToolButton
          className={clsx("Shape", { active: eraserActive })}
          type="radio"
          icon={EraserIcon}
          checked={eraserActive}
          name="eraser-delete-option"
          title={capitalizeString(t("toolBar.eraser"))}
          keyBindingLabel=""
          aria-label={capitalizeString(t("toolBar.eraser"))}
          data-testid="toolbar-eraser"
          onChange={() => {
            selectEraser();
            setIsPopupOpen(false);
          }}
        />
        <ToolButton
          className="Shape"
          type="radio"
          icon={TrashIcon}
          checked={false}
          name="eraser-delete-option"
          title={capitalizeString(t("labels.delete"))}
          keyBindingLabel=""
          aria-label={capitalizeString(t("labels.delete"))}
          data-testid="toolbar-delete"
          onChange={() => {
            deleteSelected();
            setIsPopupOpen(false);
          }}
        />
      </Popover.Content>
    </Popover.Root>
  );
};

export const ShapesSwitcher = ({
  activeTool,
  setAppState,
  app,
  UIOptions,
}: {
  activeTool: UIAppState["activeTool"];
  setAppState: React.Component<any, AppState>["setState"];
  app: AppClassProperties;
  UIOptions: AppProps["UIOptions"];
}) => {
  const [isExtraToolsMenuOpen, setIsExtraToolsMenuOpen] = useState(false);
  const stylesPanelMode = useStylesPanelMode();
  const isFullStylesPanel = stylesPanelMode === "full";
  const isCompactStylesPanel = stylesPanelMode === "compact";
  const actionManager = useExcalidrawActionManager();

  const SELECTION_TOOLS = [
    {
      type: "selection",
      icon: SelectionIcon,
      title: capitalizeString(t("toolBar.selection")),
    },
    {
      type: "lasso",
      icon: LassoIcon,
      title: capitalizeString(t("toolBar.lasso")),
    },
  ] as const;

  // 形状复合按钮的选项
  const SHAPE_TOOLS = [
    {
      type: "rectangle",
      icon: RectangleIcon,
      title: capitalizeString(t("toolBar.rectangle")),
    },
    {
      type: "diamond",
      icon: DiamondIcon,
      title: capitalizeString(t("toolBar.diamond")),
    },
    {
      type: "ellipse",
      icon: EllipseIcon,
      title: capitalizeString(t("toolBar.ellipse")),
    },
    {
      type: "triangle",
      icon: TriangleShapeIcon,
      title: capitalizeString(t("toolBar.triangle")),
    },
    {
      type: "arrow",
      icon: ArrowIcon,
      title: capitalizeString(t("toolBar.arrow")),
    },
  ] as const;

  // 颜色循环：黑 → 红 → 绿 → 黑
  const STROKE_COLOR_CYCLE = ["#1e1e1e", "#e03131", "#2f9e44"];
  const currentStrokeColor = app.state.currentItemStrokeColor;
  // 当前颜色在循环中的索引（用于决定下一个颜色）；不在列表中则从0开始
  const colorIdx = STROKE_COLOR_CYCLE.indexOf(currentStrokeColor);
  const nextColor =
    STROKE_COLOR_CYCLE[(colorIdx + 1) % STROKE_COLOR_CYCLE.length];

  // 描边样式：实线 ↔ 虚线 二态切换（dotted 归为非实线侧）
  const STROKE_STYLE_CYCLE = ["solid", "dashed"] as const;
  const currentStrokeStyle = app.state.currentItemStrokeStyle;
  // 当前是否为实线（点线/虚线都视为非实线，统一切换为实线或虚线）
  const isSolid = currentStrokeStyle === "solid";
  const nextStrokeStyle: "solid" | "dashed" = isSolid ? "dashed" : "solid";
  // 复合按钮显示当前选中的形状（如果当前是这4种之一）
  const displayedShape =
    SHAPE_TOOLS.find((s) => s.type === activeTool.type) || SHAPE_TOOLS[0];

  const frameToolSelected = activeTool.type === "frame";
  const laserToolSelected = activeTool.type === "laser";
  const lassoToolSelected =
    isFullStylesPanel &&
    activeTool.type === "lasso" &&
    app.state.preferredSelectionTool.type !== "lasso";

  const embeddableToolSelected = activeTool.type === "embeddable";

  const { TTDDialogTriggerTunnel } = useTunnels();

  return (
    <>
      {getToolbarTools(app).map(
        ({ value, icon, key, numericKey, fillable, toolbar }) => {
          if (
            toolbar === false ||
            UIOptions.tools?.[
              value as Extract<
                typeof value,
                keyof AppProps["UIOptions"]["tools"]
              >
            ] === false
          ) {
            return null;
          }

          const label = t(`toolBar.${value}`);
          const letter =
            key && capitalizeString(typeof key === "string" ? key : key[0]);
          const shortcut = letter
            ? `${letter} ${t("helpDialog.or")} ${numericKey}`
            : `${numericKey}`;
          const keybindingLabel =
            value === "hand" ? undefined : numericKey || letter;

          // when in compact styles panel mode (tablet)
          // use a ToolPopover for selection/lasso toggle as well
          if (
            (value === "selection" || value === "lasso") &&
            isCompactStylesPanel
          ) {
            return (
              <ToolPopover
                key={"selection-popover"}
                app={app}
                options={SELECTION_TOOLS}
                activeTool={activeTool}
                defaultOption={app.state.preferredSelectionTool.type}
                namePrefix="selectionType"
                title={capitalizeString(t("toolBar.selection"))}
                data-testid="toolbar-selection"
                onToolChange={(type: string) => {
                  if (type === "selection" || type === "lasso") {
                    app.setActiveTool({ type });
                    setAppState({
                      preferredSelectionTool: { type, initialized: true },
                    });
                  }
                }}
                displayedOption={
                  SELECTION_TOOLS.find(
                    (tool) =>
                      tool.type === app.state.preferredSelectionTool.type,
                  ) || SELECTION_TOOLS[0]
                }
                fillable={activeTool.type === "selection"}
              />
            );
          }

          return (
            <ToolButton
              className={clsx("Shape", { fillable })}
              key={value}
              type="radio"
              icon={icon}
              checked={activeTool.type === value}
              name="editor-current-shape"
              title={`${capitalizeString(label)} — ${shortcut}`}
              keyBindingLabel={keybindingLabel}
              aria-label={capitalizeString(label)}
              aria-keyshortcuts={shortcut}
              data-testid={`toolbar-${value}`}
              onPointerDown={({ pointerType }) => {
                if (!app.state.penDetected && pointerType === "pen") {
                  app.togglePenMode(true);
                }

                if (value === "selection") {
                  if (app.state.activeTool.type === "selection") {
                    app.setActiveTool({ type: "lasso" });
                  } else {
                    app.setActiveTool({ type: "selection" });
                  }
                }
              }}
              onChange={({ pointerType }) => {
                if (app.state.activeTool.type !== value) {
                  trackEvent("toolbar", value, "ui");
                }
                if ((value as string) === "image") {
                  app.setActiveTool({
                    type: value as "image",
                  });
                } else {
                  app.setActiveTool({ type: value });
                }
              }}
            />
          );
        },
      )}

      {/* 形状复合按钮：矩形/菱形/椭圆/三角形/箭头 */}
      <ToolPopover
        app={app}
        options={SHAPE_TOOLS}
        activeTool={activeTool}
        defaultOption="rectangle"
        namePrefix="shapeSwitcher"
        title="形状"
        data-testid="toolbar-shape-switcher"
        onToolChange={(type: string) => {
          app.setActiveTool({
            type: type as
              | "rectangle"
              | "diamond"
              | "ellipse"
              | "triangle"
              | "arrow",
          });
        }}
        displayedOption={displayedShape}
        fillable={
          activeTool.type === "rectangle" ||
          activeTool.type === "diamond" ||
          activeTool.type === "ellipse" ||
          activeTool.type === "triangle"
        }
      />

      {/* 颜色循环按钮：点击切换描边色 黑→红→绿→黑 */}
      <ToolButton
        className="Shape"
        type="button"
        icon={
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              backgroundColor: currentStrokeColor,
              border: "2px solid #fff",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
            }}
          />
        }
        title={`描边颜色：${currentStrokeColor}（点击切换为下一个）`}
        aria-label="切换描边颜色"
        data-testid="toolbar-stroke-color-cycle"
        onClick={() => {
          // 与原 APP 逻辑一致：通过 action 同时改选中元素颜色和新元素默认色
          actionManager.executeAction(actionChangeStrokeColor, "ui", {
            currentItemStrokeColor: nextColor,
          });
          trackEvent("toolbar", "strokeColorCycle", nextColor);
        }}
      />

      {/* 描边样式按钮：实线 ↔ 虚线 二态切换 */}
      <ToolButton
        className="Shape"
        type="button"
        icon={
          <svg width="28" height="22" viewBox="0 0 28 22">
            <line
              x1="3"
              y1="11"
              x2="25"
              y2="11"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={isSolid ? "0" : "5 4"}
            />
          </svg>
        }
        title={`描边样式：${isSolid ? "实线" : "虚线"}（点击切换）`}
        aria-label="切换描边样式"
        data-testid="toolbar-stroke-style-cycle"
        onClick={() => {
          actionManager.executeAction(
            actionChangeStrokeStyle,
            "ui",
            nextStrokeStyle,
          );
          trackEvent("toolbar", "strokeStyleCycle", nextStrokeStyle);
        }}
      />

      <EraserDeletePopover app={app} activeTool={activeTool} />

      <div className="App-toolbar__divider" />

      {/* 复制按钮：复制当前选中元素 */}
      {actionManager.renderAction("duplicateSelection")}

      <DropdownMenu open={isExtraToolsMenuOpen}>
        <DropdownMenu.Trigger
          className={clsx("App-toolbar__extra-tools-trigger", {
            "App-toolbar__extra-tools-trigger--selected":
              frameToolSelected ||
              embeddableToolSelected ||
              lassoToolSelected ||
              // in collab we're already highlighting the laser button
              // outside toolbar, so let's not highlight extra-tools button
              // on top of it
              (laserToolSelected && !app.props.isCollaborating),
          })}
          onToggle={() => {
            setIsExtraToolsMenuOpen(!isExtraToolsMenuOpen);
            setAppState({ openMenu: null, openPopup: null });
          }}
          title={t("toolBar.extraTools")}
        >
          {frameToolSelected
            ? frameToolIcon
            : embeddableToolSelected
            ? EmbedIcon
            : laserToolSelected && !app.props.isCollaborating
            ? laserPointerToolIcon
            : lassoToolSelected
            ? LassoIcon
            : extraToolsIcon}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          onClickOutside={() => setIsExtraToolsMenuOpen(false)}
          onSelect={() => setIsExtraToolsMenuOpen(false)}
          className="App-toolbar__extra-tools-dropdown"
        >
          <DropdownMenu.Item
            onSelect={() => app.setActiveTool({ type: "diamond" })}
            icon={DiamondIcon}
            shortcut={KEYS.D.toLocaleUpperCase()}
            data-testid="toolbar-diamond"
            selected={activeTool.type === "diamond"}
          >
            {t("toolBar.diamond")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => app.setActiveTool({ type: "text" })}
            icon={TextIcon}
            shortcut={KEYS.T.toLocaleUpperCase()}
            data-testid="toolbar-text"
            selected={activeTool.type === "text"}
          >
            {t("toolBar.text")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => app.setActiveTool({ type: "image" })}
            icon={ImageIcon}
            shortcut={KEYS["9"].toString()}
            data-testid="toolbar-image"
            selected={activeTool.type === "image"}
          >
            {t("toolBar.image")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => app.setActiveTool({ type: "frame" })}
            icon={frameToolIcon}
            shortcut={KEYS.F.toLocaleUpperCase()}
            data-testid="toolbar-frame"
            selected={frameToolSelected}
          >
            {t("toolBar.frame")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => app.setActiveTool({ type: "embeddable" })}
            icon={EmbedIcon}
            data-testid="toolbar-embeddable"
            selected={embeddableToolSelected}
          >
            {t("toolBar.embeddable")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => app.setActiveTool({ type: "laser" })}
            icon={laserPointerToolIcon}
            data-testid="toolbar-laser"
            selected={laserToolSelected}
            shortcut={KEYS.K.toLocaleUpperCase()}
          >
            {t("toolBar.laser")}
          </DropdownMenu.Item>
          {isFullStylesPanel && (
            <DropdownMenu.Item
              onSelect={() => app.setActiveTool({ type: "lasso" })}
              icon={LassoIcon}
              data-testid="toolbar-lasso"
              selected={lassoToolSelected}
            >
              {t("toolBar.lasso")}
            </DropdownMenu.Item>
          )}
          <div style={{ margin: "6px 0", fontSize: 14, fontWeight: 600 }}>
            Generate
          </div>
          {app.props.aiEnabled !== false && <TTDDialogTriggerTunnel.Out />}
          <DropdownMenu.Item
            onSelect={() => app.setOpenDialog({ name: "ttd", tab: "mermaid" })}
            icon={mermaidLogoIcon}
            data-testid="toolbar-embeddable"
          >
            {t("toolBar.mermaidToExcalidraw")}
          </DropdownMenu.Item>
          {app.props.aiEnabled !== false && app.plugins.diagramToCode && (
            <DropdownMenu.Item
              onSelect={() => app.onMagicframeToolSelect()}
              icon={MagicIcon}
              data-testid="toolbar-magicframe"
              badge={<DropdownMenu.Item.Badge>AI</DropdownMenu.Item.Badge>}
            >
              {t("toolBar.magicframe")}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item
            onSelect={() =>
              setAppState((state) => ({
                activeTool: {
                  ...state.activeTool,
                  locked: !state.activeTool.locked,
                },
              }))
            }
            icon={app.state.activeTool.locked ? LockedIcon : UnlockedIcon}
            data-testid="toolbar-lock"
            selected={app.state.activeTool.locked}
          >
            {t("toolBar.lock")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    </>
  );
};

export const ZoomActions = ({
  renderAction,
  zoom,
}: {
  renderAction: ActionManager["renderAction"];
  zoom: Zoom;
}) => (
  <Stack.Col gap={1} className={CLASSES.ZOOM_ACTIONS}>
    <Stack.Row align="center">
      {renderAction("zoomOut")}
      {renderAction("resetZoom")}
      {renderAction("zoomIn")}
    </Stack.Row>
  </Stack.Col>
);

export const UndoRedoActions = ({
  renderAction,
  className,
}: {
  renderAction: ActionManager["renderAction"];
  className?: string;
}) => (
  <div className={`undo-redo-buttons ${className}`}>
    <div className="undo-button-container">
      <Tooltip label={t("buttons.undo")}>{renderAction("undo")}</Tooltip>
    </div>
    <div className="redo-button-container">
      <Tooltip label={t("buttons.redo")}> {renderAction("redo")}</Tooltip>
    </div>
  </div>
);

export const ExitZenModeButton = ({
  actionManager,
  showExitZenModeBtn,
}: {
  actionManager: ActionManager;
  showExitZenModeBtn: boolean;
}) => (
  <button
    type="button"
    className={clsx("disable-zen-mode", {
      "disable-zen-mode--visible": showExitZenModeBtn,
    })}
    onClick={() => actionManager.executeAction(actionToggleZenMode)}
  >
    {t("buttons.exitZenMode")}
  </button>
);

export const ExitViewModeButton = ({
  actionManager,
}: {
  actionManager: ActionManager;
}) => (
  <button
    type="button"
    className="disable-view-mode"
    onClick={() => actionManager.executeAction(actionToggleViewMode)}
  >
    {pencilIcon}
  </button>
);
