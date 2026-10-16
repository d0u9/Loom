import localized from "../locales/zh.json" with { type: "json" };
import { t } from "./i18n.js";
import { ChevronDown } from "lucide-react";
import React, { useId, useState, useRef, useEffect } from "react";
import { Button } from "./button.js";
import { matchesText } from "./router.js";
import { useOutsideClose } from "./action-tools.js";

export type Option = { value: string; label: string };

/**
 * The one dropdown control. Typing filters options by text or pinyin
 * (e.g. "jid" finds eggs). With `allowCustom` the typed text itself is the
 * value, offered as “Use …”.
 */
export function Select({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled,
  allowCustom,
  onChoose,
  onSubmit,
  onEscape,
  "aria-label": ariaLabel,
}: {
  label?: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowCustom?: boolean;
  onChoose?: (value: string) => void;
  onSubmit?: () => void;
  onEscape?: () => void;
  "aria-label"?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const menu = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useOutsideClose(box, open, () => {
    setOpen(false);
    setQuery("");
  });
  const [place, setPlace] = useState<React.CSSProperties>();
  // Fixed to the viewport so a modal's scroll area never clips the list.
  useEffect(() => {
    if (!open) return;
    const follow = () => {
      const r = box.current!.getBoundingClientRect();
      setPlace({
        ...(r.bottom < innerHeight / 2
          ? { top: r.bottom + 6 }
          : { bottom: innerHeight - r.top + 6 }),
        left: r.left,
        width: r.width,
      });
    };
    follow();
    addEventListener("scroll", follow, true);
    addEventListener("resize", follow);
    return () => {
      removeEventListener("scroll", follow, true);
      removeEventListener("resize", follow);
    };
  }, [open]);
  useEffect(() => {
    const list = menu.current;
    const option = list?.children[active] as HTMLElement | undefined;
    if (!open || !list || !option) return;
    const bounds = list.getBoundingClientRect();
    const item = option.getBoundingClientRect();
    if (item.top < bounds.top) list.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom)
      list.scrollTop += item.bottom - bounds.bottom;
  }, [active, open]);
  const selected = options.find((o) => o.value === value);
  const choices = options.filter(
    (o) =>
      !query.trim() || (o.value ? matchesText(o.label, query) : allowCustom),
  );
  const typed = value.trim();
  if (
    allowCustom &&
    !onSubmit &&
    typed &&
    !options.some((o) => o.value === typed)
  )
    choices.push({ value: typed, label: t(localized["Use “"]) + typed + "”" });
  const name = label ?? ariaLabel ?? "";
  const choose = (option: Option) => {
    if (onChoose) onChoose(option.value);
    else onChange(option.value);
    setQuery("");
    setOpen(false);
    setActive(-1);
  };
  const show = () => {
    setQuery("");
    setActive(-1);
    setOpen(true);
  };
  const control = (
    <div
      ref={box}
      className="combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <input
        id={id}
        role="combobox"
        aria-label={label ? undefined : ariaLabel}
        // The wrapping label also contains the options; name only from its text.
        aria-labelledby={label ? id + "-label" : undefined}
        aria-expanded={open}
        aria-controls={id + "-options"}
        aria-autocomplete="list"
        aria-activedescendant={
          open && active >= 0 ? id + "-" + active : undefined
        }
        data-1p-ignore="true"
        autoComplete="off"
        maxLength={200}
        disabled={disabled}
        placeholder={
          allowCustom || !open ? placeholder : (selected?.label ?? placeholder)
        }
        // Closed it shows the choice; open it holds the filter text.
        value={allowCustom ? value : open ? query : (selected?.label ?? "")}
        // Typing over the selected label starts a new filter. Touch skips
        // the selection: it pops the system copy/paste menu.
        onFocus={(event) =>
          !matchMedia("(pointer: coarse)").matches && event.target.select()
        }
        onClick={() => !open && show()}
        onChange={(event) => {
          if (allowCustom) onChange(event.target.value);
          setQuery(event.target.value);
          // Picking highlights the best match; custom text stays as typed.
          setActive(!allowCustom && event.target.value.trim() ? 0 : -1);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape" && !open) onEscape?.();
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setQuery("");
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive(
              !open || active < 0
                ? event.key === "ArrowDown"
                  ? 0
                  : choices.length - 1
                : (active +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    choices.length) %
                    choices.length,
            );
          }
          if (event.key === "Enter" && (open || onSubmit)) {
            event.preventDefault();
            if (open && choices[active]) choose(choices[active]);
            else if (onSubmit) {
              onSubmit();
              setOpen(false);
            } else setOpen(false);
          }
        }}
      />
      <Button
        variant="icon"
        className="combobox-toggle"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (open ? setOpen(false) : show())}
      >
        <ChevronDown className="icon" aria-hidden="true" />
      </Button>
      {open && (
        <div
          ref={menu}
          id={id + "-options"}
          role="listbox"
          aria-label={onSubmit ? t(localized["Matching items"]) : name}
          className="combobox-options"
          style={place}
        >
          {choices.length === 0 && (
            <p className="empty">{t(localized["No matching options"])}</p>
          )}
          {choices.map((option, index) => (
            <Button
              key={option.value}
              id={id + "-" + index}
              variant="ghost"
              role="option"
              tabIndex={-1}
              aria-selected={
                onSubmit ? active === index : option.value === value
              }
              className={active === index ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
  // Same wrapping <label> as every other field, so one CSS rule spaces it.
  return label ? (
    <label>
      <span id={id + "-label"}>{label}</span>
      {control}
    </label>
  ) : (
    control
  );
}
