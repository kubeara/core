import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { cn } from "@/lib/utils";
import "./stepper.css";

const ROOT_NAME = "Stepper";
const LIST_NAME = "StepperList";
const ITEM_NAME = "StepperItem";
const TRIGGER_NAME = "StepperTrigger";
const INDICATOR_NAME = "StepperIndicator";
const SEPARATOR_NAME = "StepperSeparator";
const TITLE_NAME = "StepperTitle";
const DESCRIPTION_NAME = "StepperDescription";
const CONTENT_NAME = "StepperContent";
const PREV_NAME = "StepperPrev";
const NEXT_NAME = "StepperNext";

type Direction = "ltr" | "rtl";
type Orientation = "horizontal" | "vertical";
type NavigationDirection = "next" | "prev";
type DataState = "inactive" | "active" | "completed";

type DivProps = React.ComponentProps<"div"> & { asChild?: boolean };
type ButtonProps = React.ComponentProps<"button"> & { asChild?: boolean };

function getId(
  id: string,
  variant: "trigger" | "content" | "title" | "description",
  value: string,
) {
  return `${id}-${variant}-${value}`;
}

/**
 * Gets the data state for the stepper.
 * @param value The value of the current step.
 * @param itemValue The value of the item.
 * @param stepState The state of the step.
 * @param steps The steps.
 * @param variant The variant of the data state.
 * @returns The data state.
 */
function getDataState(
  value: string | undefined,
  itemValue: string,
  stepState: StepState | undefined,
  steps: Map<string, StepState>,
  variant: "item" | "separator" = "item",
): DataState {
  const stepKeys = Array.from(steps.keys());
  const currentIndex = stepKeys.indexOf(itemValue);

  if (stepState?.completed) {
    return "completed";
  }

  if (value === itemValue) {
    return variant === "separator" ? "inactive" : "active";
  }

  if (value) {
    const activeIndex = stepKeys.indexOf(value);
    if (activeIndex > currentIndex) {
      return "completed";
    }
  }

  return "inactive";
}

interface StepState {
  value: string;
  completed: boolean;
  disabled: boolean;
}

interface StoreState {
  steps: Map<string, StepState>;
  value: string;
  revision: number;
}

/**
 * The store for the stepper.
 * @param props The props for the store.
 * @returns The store.
 */
interface Store {
  subscribe: (callback: () => void) => () => void;
  getState: () => StoreState;
  setState: <K extends keyof StoreState>(key: K, value: StoreState[K]) => void;
  setStateWithValidation: (
    value: string,
    direction: NavigationDirection,
  ) => Promise<boolean>;
  notify: () => void;
  addStep: (value: string, completed: boolean, disabled: boolean) => void;
  removeStep: (value: string) => void;
  setStep: (value: string, completed: boolean, disabled: boolean) => void;
}

const StoreContext = React.createContext<Store | null>(null);

function useStoreContext(consumerName: string) {
  const context = React.useContext(StoreContext);
  if (!context) {
    throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``);
  }
  return context;
}

function useStore<T>(selector: (state: StoreState) => T): T {
  const store = useStoreContext("useStore");
  const selectorRef = React.useRef(selector);
  selectorRef.current = selector;
  const getSnapshot = React.useCallback(
    () => selectorRef.current(store.getState()),
    [store],
  );
  return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

function useStepsMap() {
  useStore((state) => state.revision);
  return useStoreContext("useStepsMap").getState().steps;
}

interface StepperContextValue {
  rootId: string;
  dir: Direction;
  orientation: Orientation;
  disabled: boolean;
}

const StepperContext = React.createContext<StepperContextValue | null>(null);

function useStepperContext(consumerName: string) {
  const context = React.useContext(StepperContext);
  if (!context) {
    throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``);
  }
  return context;
}

/**
 * The props for the stepper.
 * @param props The props for the stepper.
 * @returns The stepper.
 */
export interface StepperProps extends DivProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onValidate?: (
    value: string,
    direction: NavigationDirection,
  ) => boolean | Promise<boolean>;
  orientation?: Orientation;
  disabled?: boolean;
}

/**
 * The stepper component.
 * @param props The props for the stepper.
 * @returns The stepper.
 */
function Stepper(props: StepperProps) {
  const {
    value,
    defaultValue,
    onValueChange,
    onValidate,
    orientation = "horizontal",
    asChild,
    disabled = false,
    className,
    id,
    dir: dirProp,
    ...rootProps
  } = props;

  const listenersRef = React.useRef(new Set<() => void>());
  const stateRef = React.useRef<StoreState>({
    steps: new Map(),
    value: value ?? defaultValue ?? "",
    revision: 0,
  });
  const onValueChangeRef = React.useRef(onValueChange);
  const onValidateRef = React.useRef(onValidate);
  onValueChangeRef.current = onValueChange;
  onValidateRef.current = onValidate;

  const store = React.useMemo<Store>(() => {
    const notify = () => {
      stateRef.current.revision += 1;
      for (const callback of listenersRef.current) {
        callback();
      }
    };

    return {
      subscribe: (callback) => {
        listenersRef.current.add(callback);
        return () => listenersRef.current.delete(callback);
      },
      getState: () => stateRef.current,
      setState: (key, nextValue) => {
        if (Object.is(stateRef.current[key], nextValue)) {
          return;
        }

        if (key === "value" && typeof nextValue === "string") {
          stateRef.current.value = nextValue;
          onValueChangeRef.current?.(nextValue);
        } else {
          stateRef.current[key] = nextValue;
        }

        notify();
      },
      setStateWithValidation: async (nextValue, direction) => {
        if (!onValidateRef.current) {
          store.setState("value", nextValue);
          return true;
        }

        try {
          const isValid = await onValidateRef.current(nextValue, direction);
          if (isValid) {
            store.setState("value", nextValue);
          }
          return isValid;
        } catch {
          return false;
        }
      },
      addStep: (stepValue, completed, stepDisabled) => {
        stateRef.current.steps.set(stepValue, {
          value: stepValue,
          completed,
          disabled: stepDisabled,
        });
        notify();
      },
      removeStep: (stepValue) => {
        stateRef.current.steps.delete(stepValue);
        notify();
      },
      setStep: (stepValue, completed, stepDisabled) => {
        const step = stateRef.current.steps.get(stepValue);
        if (!step) {
          return;
        }

        stateRef.current.steps.set(stepValue, {
          ...step,
          completed,
          disabled: stepDisabled,
        });
        notify();
      },
      notify,
    };
  }, []);

  React.useLayoutEffect(() => {
    if (value !== undefined) {
      store.setState("value", value);
    }
  }, [store, value]);

  const dir: Direction = dirProp === "rtl" ? "rtl" : "ltr";
  const instanceId = React.useId();
  const rootId = id ?? instanceId;
  const contextValue = React.useMemo(
    () => ({ rootId, dir, orientation, disabled }),
    [rootId, dir, orientation, disabled],
  );

  const RootPrimitive = asChild ? Slot : "div";

  return (
    <StoreContext.Provider value={store}>
      <StepperContext.Provider value={contextValue}>
        <RootPrimitive
          id={rootId}
          data-disabled={disabled ? "" : undefined}
          data-orientation={orientation}
          data-slot="stepper"
          dir={dir}
          {...rootProps}
          className={cn("ui-stepper", className)}
        />
      </StepperContext.Provider>
    </StoreContext.Provider>
  );
}

/**
 * The list for the stepper.
 * @param props The props for the list.
 * @returns The list.
 */
function StepperList(props: DivProps) {
  const { asChild, className, ...listProps } = props;
  const context = useStepperContext(LIST_NAME);
  const ListPrimitive = asChild ? Slot : "div";

  return (
    <ListPrimitive
      role="tablist"
      aria-orientation={context.orientation}
      data-orientation={context.orientation}
      data-slot="stepper-list"
      dir={context.dir}
      {...listProps}
      className={cn("ui-stepper-list", className)}
    />
  );
}

interface StepperItemContextValue {
  value: string;
  stepState: StepState | undefined;
}

const StepperItemContext = React.createContext<StepperItemContextValue | null>(
  null,
);

/**
 * The context for the stepper item.
 * @param consumerName The name of the consumer.
 * @returns The context.
 */
function useStepperItemContext(consumerName: string) {
  const context = React.useContext(StepperItemContext);
  if (!context) {
    throw new Error(`\`${consumerName}\` must be used within \`${ITEM_NAME}\``);
  }
  return context;
}

interface StepperItemProps extends DivProps {
  value: string;
  completed?: boolean;
  disabled?: boolean;
}

/**
 * The item for the stepper.
 * @param props The props for the item.
 * @returns The item.
 */
function StepperItem(props: StepperItemProps) {
  const {
    value: itemValue,
    completed = false,
    disabled = false,
    asChild,
    className,
    ...itemProps
  } = props;
  const context = useStepperContext(ITEM_NAME);
  const store = useStoreContext(ITEM_NAME);
  const value = useStore((state) => state.value);

  React.useLayoutEffect(() => {
    store.addStep(itemValue, completed, disabled);
    return () => {
      store.removeStep(itemValue);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemValue, store]);

  React.useLayoutEffect(() => {
    store.setStep(itemValue, completed, disabled);
  }, [completed, disabled, itemValue, store]);

  const stepState = useStore((state) => state.steps.get(itemValue));
  const steps = useStepsMap();
  const dataState = getDataState(value, itemValue, stepState, steps);
  const itemContextValue = React.useMemo(
    () => ({ value: itemValue, stepState }),
    [itemValue, stepState],
  );
  const ItemPrimitive = asChild ? Slot : "div";

  return (
    <StepperItemContext.Provider value={itemContextValue}>
      <ItemPrimitive
        data-disabled={stepState?.disabled ? "" : undefined}
        data-orientation={context.orientation}
        data-state={dataState}
        data-slot="stepper-item"
        dir={context.dir}
        {...itemProps}
        className={cn("ui-stepper-item", className)}
      />
    </StepperItemContext.Provider>
  );
}

/**
 * The trigger for the stepper.
 * @param props The props for the trigger.
 * @returns The trigger.
 */
function StepperTrigger(props: ButtonProps) {
  const {
    asChild,
    onClick: onClickProp,
    onKeyDown: onKeyDownProp,
    disabled,
    className,
    ...triggerProps
  } = props;
  const context = useStepperContext(TRIGGER_NAME);
  const itemContext = useStepperItemContext(TRIGGER_NAME);
  const store = useStoreContext(TRIGGER_NAME);
  const value = useStore((state) => state.value);
  const steps = useStepsMap();
  const stepState = useStore((state) => state.steps.get(itemContext.value));
  const isDisabled = Boolean(disabled || stepState?.disabled || context.disabled);
  const isActive = value === itemContext.value;
  const dataState = getDataState(value, itemContext.value, stepState, steps);
  const triggerId = getId(context.rootId, "trigger", itemContext.value);
  const contentId = getId(context.rootId, "content", itemContext.value);
  const titleId = getId(context.rootId, "title", itemContext.value);
  const descriptionId = getId(context.rootId, "description", itemContext.value);
  const stepKeys = Array.from(steps.keys());
  const stepPosition = stepKeys.indexOf(itemContext.value) + 1;
  const TriggerPrimitive = asChild ? Slot : "button";

  async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    onClickProp?.(event);
    if (event.defaultPrevented || isDisabled) {
      return;
    }

    const currentIndex = stepKeys.indexOf(value);
    const targetIndex = stepKeys.indexOf(itemContext.value);
    const direction: NavigationDirection =
      targetIndex > currentIndex ? "next" : "prev";

    await store.setStateWithValidation(itemContext.value, direction);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    onKeyDownProp?.(event);
    if (event.defaultPrevented) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
    }
  }

  return (
    <TriggerPrimitive
      id={triggerId}
      role="tab"
      type="button"
      aria-controls={contentId}
      aria-current={isActive ? "step" : undefined}
      aria-describedby={`${titleId} ${descriptionId}`}
      aria-posinset={stepPosition}
      aria-selected={isActive}
      aria-setsize={stepKeys.length}
      data-disabled={isDisabled ? "" : undefined}
      data-state={dataState}
      data-slot="stepper-trigger"
      disabled={isDisabled}
      {...triggerProps}
      className={cn("ui-stepper-trigger", className)}
      onClick={(event) => void handleClick(event)}
      onKeyDown={handleKeyDown}
    />
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="M5 12.5 9.5 17 19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The indicator for the stepper.
 * @param props The props for the indicator.
 * @returns The indicator.
 */
function StepperIndicator(props: DivProps) {
  const { className, children, asChild, ...indicatorProps } = props;
  const context = useStepperContext(INDICATOR_NAME);
  const itemContext = useStepperItemContext(INDICATOR_NAME);
  const value = useStore((state) => state.value);
  const steps = useStepsMap();
  const dataState = getDataState(
    value,
    itemContext.value,
    itemContext.stepState,
    steps,
  );
  const stepPosition = Array.from(steps.keys()).indexOf(itemContext.value) + 1;
  const IndicatorPrimitive = asChild ? Slot : "div";

  return (
    <IndicatorPrimitive
      data-state={dataState}
      data-slot="stepper-indicator"
      dir={context.dir}
      {...indicatorProps}
      className={cn("ui-stepper-indicator", className)}
    >
      {children ??
        (dataState === "completed" ? <CheckIcon /> : stepPosition)}
    </IndicatorPrimitive>
  );
}

/**
 * The separator for the stepper.
 * @param props The props for the separator.
 * @returns The separator.
 */
function StepperSeparator(props: DivProps) {
  const { className, asChild, ...separatorProps } = props;
  const context = useStepperContext(SEPARATOR_NAME);
  const itemContext = useStepperItemContext(SEPARATOR_NAME);
  const value = useStore((state) => state.value);
  const steps = useStepsMap();
  const stepIndex = Array.from(steps.keys()).indexOf(itemContext.value);

  if (stepIndex === steps.size - 1) {
    return null;
  }

  const dataState = getDataState(
    value,
    itemContext.value,
    itemContext.stepState,
    steps,
    "separator",
  );
  const SeparatorPrimitive = asChild ? Slot : "div";

  return (
    <SeparatorPrimitive
      role="separator"
      aria-hidden="true"
      aria-orientation={context.orientation}
      data-orientation={context.orientation}
      data-state={dataState}
      data-slot="stepper-separator"
      dir={context.dir}
      {...separatorProps}
      className={cn("ui-stepper-separator", className)}
    />
  );
}

/**
 * The title for the stepper.
 * @param props The props for the title.
 * @returns The title.
 */
function StepperTitle(props: React.ComponentProps<"span"> & { asChild?: boolean }) {
  const { className, asChild, ...titleProps } = props;
  const context = useStepperContext(TITLE_NAME);
  const itemContext = useStepperItemContext(TITLE_NAME);
  const TitlePrimitive = asChild ? Slot : "span";

  return (
    <TitlePrimitive
      id={getId(context.rootId, "title", itemContext.value)}
      data-slot="title"
      dir={context.dir}
      {...titleProps}
      className={cn("ui-stepper-title", className)}
    />
  );
}

/**
 * The description for the stepper.
 * @param props The props for the description.
 * @returns The description.
 */
function StepperDescription(
  props: React.ComponentProps<"span"> & { asChild?: boolean },
) {
  const { className, asChild, ...descriptionProps } = props;
  const context = useStepperContext(DESCRIPTION_NAME);
  const itemContext = useStepperItemContext(DESCRIPTION_NAME);
  const DescriptionPrimitive = asChild ? Slot : "span";

  return (
    <DescriptionPrimitive
      id={getId(context.rootId, "description", itemContext.value)}
      data-slot="description"
      dir={context.dir}
      {...descriptionProps}
      className={cn("ui-stepper-description", className)}
    />
  );
}

interface StepperContentProps extends DivProps {
  value: string;
  forceMount?: boolean;
}

/**
 * The content for the stepper.
 * @param props The props for the content.
 * @returns The content.
 */
function StepperContent(props: StepperContentProps) {
  const {
    value: valueProp,
    asChild,
    forceMount = false,
    className,
    ...contentProps
  } = props;
  const context = useStepperContext(CONTENT_NAME);
  const value = useStore((state) => state.value);

  if (valueProp !== value && !forceMount) {
    return null;
  }

  const ContentPrimitive = asChild ? Slot : "div";

  return (
    <ContentPrimitive
      id={getId(context.rootId, "content", valueProp)}
      role="tabpanel"
      aria-labelledby={getId(context.rootId, "trigger", valueProp)}
      data-slot="stepper-content"
      dir={context.dir}
      {...contentProps}
      className={cn("ui-stepper-content", className)}
    />
  );
}

/**
 * The previous button for the stepper.
 * @param props The props for the previous button.
 * @returns The previous button.
 */
function StepperPrev(props: ButtonProps) {
  const { asChild, onClick: onClickProp, disabled, ...prevProps } = props;
  const store = useStoreContext(PREV_NAME);
  const value = useStore((state) => state.value);
  const steps = useStepsMap();
  const stepKeys = Array.from(steps.keys());
  const currentIndex = value ? stepKeys.indexOf(value) : -1;
  const isDisabled = Boolean(disabled || currentIndex <= 0);
  const PrevPrimitive = asChild ? Slot : "button";

  async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    onClickProp?.(event);
    if (event.defaultPrevented || isDisabled) {
      return;
    }

    const previousValue = stepKeys[Math.max(currentIndex - 1, 0)];
    if (previousValue) {
      await store.setStateWithValidation(previousValue, "prev");
    }
  }

  return (
    <PrevPrimitive
      type="button"
      data-slot="stepper-prev"
      disabled={isDisabled}
      {...prevProps}
      onClick={(event) => void handleClick(event)}
    />
  );
}

/**
 * The next button for the stepper.
 * @param props The props for the next button.
 * @returns The next button.
 */
function StepperNext(props: ButtonProps) {
  const { asChild, onClick: onClickProp, disabled, ...nextProps } = props;
  const store = useStoreContext(NEXT_NAME);
  const value = useStore((state) => state.value);
  const steps = useStepsMap();
  const stepKeys = Array.from(steps.keys());
  const currentIndex = value ? stepKeys.indexOf(value) : -1;
  const isDisabled = Boolean(disabled || currentIndex >= stepKeys.length - 1);
  const NextPrimitive = asChild ? Slot : "button";

  async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    onClickProp?.(event);
    if (event.defaultPrevented || isDisabled) {
      return;
    }

    const nextValue = stepKeys[Math.min(currentIndex + 1, stepKeys.length - 1)];
    if (nextValue) {
      await store.setStateWithValidation(nextValue, "next");
    }
  }

  return (
    <NextPrimitive
      type="button"
      data-slot="stepper-next"
      disabled={isDisabled}
      {...nextProps}
      onClick={(event) => void handleClick(event)}
    />
  );
}

export {
  Stepper,
  StepperContent,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperList,
  StepperNext,
  StepperPrev,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
};
