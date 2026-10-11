import { expect, test } from "vitest";
import { createPiExtensionHost } from "../index.js";

test("parallel questionnaires sharing a header keep their dialogs and answers separate", () => {
  const host = createPiExtensionHost();
  const question = (text: string) => ({
    questions: [
      {
        header: "Choice",
        question: text,
        options: [
          { label: "Yes", description: "Proceed" },
          { label: "No", description: "Stop" },
        ],
      },
    ],
  });
  for (const [callId, text] of [
    ["first", "Deploy staging?"],
    ["second", "Deploy production?"],
  ]) {
    host.onToolStart({
      callId,
      toolName: "ask_user_question",
      args: question(text),
      status: "running",
      result: null,
    });
  }
  const firstDialog = {
    type: "extension_ui_request" as const,
    id: "staging-dialog",
    method: "select",
    title: "[Choice] Deploy staging?",
    options: ["1. Yes — Proceed", "2. No — Stop", "3. Type something."],
  };
  const secondDialog = {
    ...firstDialog,
    id: "production-dialog",
    title: "[Choice] Deploy production?",
  };
  const first = host.mapDialog(firstDialog, "pi");
  const second = host.mapDialog(secondDialog, "pi");
  expect(first?.type).toBe("permission");
  expect(second?.type).toBe("permission");
  if (first?.type !== "permission" || second?.type !== "permission")
    throw new Error("Missing forms");
  expect(second.request.id).toBe("rpiv-question:second");
  expect(host.respondToPermission(first.request, { behavior: "deny" })).toEqual({
    responses: [{ id: firstDialog.id, response: { cancelled: true } }],
  });
  expect(
    host.respondToPermission(second.request, {
      behavior: "allow",
      updatedInput: { answers: { Choice: "Yes" } },
    }),
  ).toEqual({ responses: [{ id: secondDialog.id, response: { value: secondDialog.options[0] } }] });
});

test("two calls with identical questionnaires receive distinct cards", () => {
  const host = createPiExtensionHost();
  const args = {
    questions: [
      {
        header: "Choice",
        question: "Proceed?",
        options: [
          { label: "Yes", description: "Proceed" },
          { label: "No", description: "Stop" },
        ],
      },
    ],
  };
  for (const callId of ["first", "second"])
    host.onToolStart({
      callId,
      toolName: "ask_user_question",
      args,
      status: "running",
      result: null,
    });
  const dialog = {
    type: "extension_ui_request" as const,
    id: "first-dialog",
    method: "select",
    title: "[Choice] Proceed?",
    options: ["1. Yes — Proceed", "2. Type something."],
  };
  const first = host.mapDialog(dialog, "pi");
  const second = host.mapDialog({ ...dialog, id: "second-dialog" }, "pi");
  expect(first?.type).toBe("permission");
  expect(second?.type).toBe("permission");
  if (first?.type !== "permission" || second?.type !== "permission")
    throw new Error("Missing forms");
  expect(second.request.id).not.toBe(first.request.id);
});
