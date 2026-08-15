"use client";

import * as React from "react";
import { Button, Textarea } from "@/components/ui";

export function Composer({
  disabled,
  disabledReason,
  pending,
  onSend,
}: {
  disabled: boolean;
  disabledReason?: string;
  pending: boolean;
  onSend: (content: string) => void;
}) {
  const [value, setValue] = React.useState("");

  function submit() {
    const content = value.trim();
    if (!content || disabled || pending) return;
    onSend(content);
    setValue("");
  }

  return (
    <div className="space-y-2 border-t border-rule pt-3">
      {disabled && disabledReason && <p className="text-xs text-critical">{disabledReason}</p>}
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Nhập câu hỏi..."
          disabled={disabled || pending}
          maxLength={1000}
          className="min-h-[52px]"
          aria-label="Nội dung tin nhắn"
        />
        <Button onClick={submit} disabled={disabled || pending || value.trim().length === 0} loading={pending}>
          Gửi
        </Button>
      </div>
    </div>
  );
}
