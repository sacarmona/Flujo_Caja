"use client";

import { useState } from "react";

/** Convierte "1234.5" (string numerico, punto decimal) a sanitized "1234,5" (coma decimal, sin separador de miles). */
function decimalToSanitized(decimalValue: string): string {
  const [intPart, decPart] = decimalValue.split(".");
  const intDigits = intPart.replace(/\D/g, "");
  return decPart !== undefined ? `${intDigits},${decPart.replace(/\D/g, "").slice(0, 2)}` : intDigits;
}

/** Conserva solo digitos y, como maximo, una coma decimal. */
function sanitizeInput(input: string): string {
  let seenComma = false;
  let result = "";
  for (const char of input) {
    if (char >= "0" && char <= "9") {
      result += char;
    } else if (char === "," && !seenComma) {
      result += char;
      seenComma = true;
    }
  }
  return result;
}

/** "1234,5" -> "1234.5" (string numerico estandar, listo para Prisma.Decimal/parseFloat). */
function sanitizedToRawValue(sanitized: string): string {
  if (!sanitized) return "";
  const [intPart, decPart] = sanitized.split(",");
  const intDigits = intPart.replace(/^0+(?=\d)/, "");
  return decPart !== undefined ? `${intDigits || "0"}.${decPart}` : intDigits;
}

/** "1234,5" -> "1.234,5" (separador de miles "." como pide la convencion chilena). */
function sanitizedToDisplay(sanitized: string): string {
  const [intPart, decPart] = sanitized.split(",");
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decPart !== undefined ? `${formattedInt},${decPart}` : formattedInt;
}

export function AmountInput({
  className,
  defaultValue,
  disabled,
  name,
  onBlur,
  onRawChange,
  placeholder,
  required
}: {
  className?: string;
  defaultValue?: string;
  disabled?: boolean;
  /** Si se entrega, se renderiza un input oculto con este name para envio via form action. */
  name?: string;
  onBlur?: (rawValue: string) => void;
  /** Se dispara en cada cambio con el valor numerico estandar ("1234.5"), util para edicion inline sin form. */
  onRawChange?: (rawValue: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [sanitized, setSanitized] = useState(() => decimalToSanitized(defaultValue ?? ""));
  const rawValue = sanitizedToRawValue(sanitized);

  return (
    <>
      <input
        className={className}
        disabled={disabled}
        inputMode="decimal"
        onBlur={() => onBlur?.(rawValue)}
        onChange={(event) => {
          const next = sanitizeInput(event.target.value);
          setSanitized(next);
          onRawChange?.(sanitizedToRawValue(next));
        }}
        placeholder={placeholder}
        required={required}
        type="text"
        value={sanitizedToDisplay(sanitized)}
      />
      {name ? <input name={name} type="hidden" value={rawValue} /> : null}
    </>
  );
}
