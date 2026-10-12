import localized from "../locales/zh.json" with { type: "json" };
import React, { useId, useState, useRef, useEffect } from "react";
import { Button } from "./button.js";

export function Combobox({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const menu = useRef<HTMLDivElement>(null);
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
  const choices = [
    "",
    ...options.filter((option) =>
      option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    ),
  ];
  const typed = value.trim();
  if (typed && !options.includes(typed)) choices.push(typed);
  const choose = (option: string) => {
    onChange(option);
    setOpen(false);
    setActive(-1);
  };
  return (
    <div className="combobox-field">
      <label htmlFor={id}>{label}</label>
      <div
        className="combobox"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setOpen(false);
        }}
      >
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={id + "-options"}
          aria-autocomplete="list"
          aria-activedescendant={
            open && active >= 0 ? id + "-" + active : undefined
          }
          data-1p-ignore="true"
          autoComplete="off"
          maxLength={200}
          placeholder={localized["Ungrouped"]}
          value={value}
          onClick={() => {
            setOpen(true);
            setQuery("");
            setActive(-1);
          }}
          onFocus={() => {
            setQuery("");
            setActive(-1);
            setOpen(true);
          }}
          onChange={(event) => {
            onChange(event.target.value);
            setQuery(event.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive(
                active < 0
                  ? event.key === "ArrowDown"
                    ? 0
                    : choices.length - 1
                  : (active +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      choices.length) %
                      choices.length,
              );
            }
            if (event.key === "Enter" && open) {
              event.preventDefault();
              if (active >= 0) choose(choices[active]);
              else setOpen(false);
            }
          }}
        />
        <Button
          variant="icon"
          className="combobox-toggle"
          tabIndex={-1}
          aria-label={localized["Choose "] + label}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setQuery("");
            setActive(-1);
            setOpen(!open);
          }}
        >
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m7 10 5 5 5-5" />
          </svg>
        </Button>
        {open && (
          <div
            ref={menu}
            id={id + "-options"}
            role="listbox"
            aria-label={label}
            className="combobox-options"
          >
            {choices.map((option, index) => (
              <Button
                key={option}
                id={id + "-" + index}
                variant="ghost"
                role="option"
                tabIndex={-1}
                aria-selected={option === value}
                className={active === index ? "active" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                {option
                  ? options.includes(option)
                    ? option
                    : `${localized["Use “"]}${option}”`
                  : localized["Ungrouped"]}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
