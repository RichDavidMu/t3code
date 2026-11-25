import { useState } from "react";
import { page, userEvent } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import { render, stubGlobal } from "../../../test/render";
import { AppAtomRegistryProvider } from "../../rpc/atomRegistry";

vi.mock(import("../../state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: ((command: unknown) => command) as never,
}));
vi.mock(import("~/state/environments"), async (original) => ({
  ...(await original()),
  useRelayEnvironmentDiscovery: (() => ({ environments: new Map() })) as never,
}));

import { AddEnvironmentDialog } from "./AddEnvironmentDialog";

function Owner() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <AppAtomRegistryProvider>
      <AddEnvironmentDialog
        open={open}
        routeTarget={null}
        error={error}
        onOpenChange={setOpen}
        onErrorChange={setError}
      />
    </AppAtomRegistryProvider>
  );
}

describe("AddEnvironmentDialog", () => {
  it("pairs by address only, with no SSH option on desktop", async () => {
    using _bridge = stubGlobal("desktopBridge", {});
    await using _screen = await render(<Owner />);

    await userEvent.click(page.getByRole("button", { name: "Add environment" }));
    await expect.element(page.getByPlaceholder("backend.example.com")).toBeInTheDocument();
    await expect.element(page.getByPlaceholder("PAIRCODE")).toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: /^SSH/ })).not.toBeInTheDocument();
  });

  it("fills host and code from a pasted pairing URL", async () => {
    await using _screen = await render(<Owner />);

    await userEvent.click(page.getByRole("button", { name: "Add environment" }));
    await userEvent.fill(
      page.getByPlaceholder("backend.example.com"),
      "http://100.101.102.103:3773/pair#token=PAIRCODE1",
    );
    await expect.element(page.getByPlaceholder("PAIRCODE")).toHaveValue("PAIRCODE1");
  });
});
