import { useState } from "react";
import { useAuth } from "@clerk/react";
import { Alert } from "@go-tickets/ui/components/alert";
import { Button } from "@go-tickets/ui/components/button";
import { Card, CardContent } from "@go-tickets/ui/components/card";
import { Input } from "@go-tickets/ui/components/input";

export function ParticipantNameForm({
  initialName,
  onSaved,
}: {
  initialName: string;
  onSaved: (name: string) => void;
}) {
  const { getToken } = useAuth();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Card>
      <CardContent>
        <form
          className="mx-auto grid w-full max-w-lg gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const normalized = name.trim();
            if (!normalized) return;
            setBusy(true);
            setError("");
            try {
              const token = await getToken();
              const response = await fetch("/api/profile", {
                method: "PUT",
                headers: {
                  Authorization: `Bearer ${token ?? ""}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ name: normalized }),
              });
              if (!response.ok) throw new Error("参加者名を保存できません");
              const result = await response.json();
              onSaved(result.name);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "保存に失敗しました");
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 className="m-0 text-2xl font-semibold text-foreground">参加者名を設定</h2>
          <p className="m-0 leading-relaxed text-muted-foreground">
            イベントの参加者一覧などで使う名前です。実名・ハンドルネームのどちらでも構いません。あとから変更できます。
          </p>
          <label className="grid gap-2 font-semibold" htmlFor="participant-name">
            参加者名
            <Input
              id="participant-name"
              className="h-10.5 rounded-md border border-border px-3"
              value={name}
              maxLength={100}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {error && <Alert variant="destructive">{error}</Alert>}
          <Button disabled={busy || !name.trim()}>保存して続ける</Button>
        </form>
      </CardContent>
    </Card>
  );
}
