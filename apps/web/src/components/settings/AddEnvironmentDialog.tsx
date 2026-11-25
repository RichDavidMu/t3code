import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import { m } from "~/i18n/messages";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { T, useGT } from "gt-react";
import {
  RelayConnectionRegistration,
  RelayConnectionTarget,
} from "@t3tools/client-runtime/connection";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { Input } from "../ui/input";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Button } from "../ui/button";
import { environmentCatalog } from "~/connection/catalog";
import { connectPairing as connectPairingAtom } from "~/connection/onboarding";
import { type EnvironmentPresentation, useRelayEnvironmentDiscovery } from "~/state/environments";
import type { AddEnvironmentPrefill } from "~/state/linkedThreadView";
import { useAtomCommand } from "../../state/use-atom-command";
import { parsePairingUrlFields, parseRemotePairingFields } from "./ConnectionsSettings.logic";

export function AddEnvironmentDialog({
  open,
  prefill = null,
  routeTarget,
  error,
  initialHost = "",
  onOpenChange,
  onErrorChange,
}: {
  readonly open: boolean;
  /** A machine the user chose elsewhere to pair with; they supply only the pairing code. */
  readonly prefill?: AddEnvironmentPrefill | null;
  readonly routeTarget: EnvironmentPresentation | null;
  /** An address already known for the machine being added, such as one a link uses. */
  readonly initialHost?: string;
  readonly error: string | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onErrorChange: (error: string | null) => void;
}) {
  const gt = useGT();
  const connectPairing = useAtomCommand(connectPairingAtom, { reportFailure: false });
  const registerEnvironment = useAtomCommand(environmentCatalog.register, {
    reportFailure: false,
  });
  const relayDiscoveryState = useRelayEnvironmentDiscovery();
  const [savedBackendHost, setSavedBackendHost] = useState(prefill?.host ?? initialHost);
  const [savedBackendPairingCode, setSavedBackendPairingCode] = useState("");
  const [isAddingSavedBackend, setIsAddingSavedBackend] = useState(false);
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSavedBackendHost(initialHost);
      setSavedBackendPairingCode("");
    }
    onOpenChange(nextOpen);
  };

  const handleAddSavedBackend = async () => {
    setIsAddingSavedBackend(true);
    onErrorChange(null);
    let remotePairingInput: ReturnType<typeof parseRemotePairingFields>;
    try {
      remotePairingInput = parseRemotePairingFields({
        host: savedBackendHost,
        pairingCode: savedBackendPairingCode,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? (thrownErrorMessage(error, m) ?? error.message)
          : gt("Failed to add backend.");
      onErrorChange(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: gt("Could not add backend"),
          description: message,
        }),
      );
      setIsAddingSavedBackend(false);
      return;
    }

    const expected = routeTarget ?? prefill;
    const result = await connectPairing({
      ...remotePairingInput,
      ...(expected ? { expectedEnvironmentId: expected.environmentId } : {}),
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        const message =
          error instanceof Error
            ? (thrownErrorMessage(error, m) ?? error.message)
            : gt("Failed to add backend.");
        onErrorChange(message);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: gt("Could not add backend"),
            description: message,
          }),
        );
      }
      setIsAddingSavedBackend(false);
      return;
    }

    handleOpenChange(false);
    toastManager.add(
      routeTarget
        ? {
            type: "success",
            title: gt("Route added"),
            description: gt("{environment} now has another way to connect.", {
              environment: routeTarget.label,
            }),
          }
        : {
            type: "success",
            title: gt("Backend added"),
            description: gt("The environment is saved and will reconnect on app startup."),
          },
    );
    setIsAddingSavedBackend(false);
  };

  const handleSavedBackendHostChange = (value: string) => {
    const parsedPairingUrl = parsePairingUrlFields(value);
    if (parsedPairingUrl) {
      setSavedBackendHost(parsedPairingUrl.host);
      setSavedBackendPairingCode(parsedPairingUrl.pairingCode);
      return;
    }
    setSavedBackendHost(value);
  };

  const renderRemoteFields = () => (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-foreground">
            <T>Host</T>
          </span>
          <Input
            value={savedBackendHost}
            onChange={(event) => handleSavedBackendHostChange(event.target.value)}
            placeholder="backend.example.com"
            disabled={isAddingSavedBackend}
            spellCheck={false}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-foreground">
            <T>Pairing code</T>
          </span>
          <Input
            value={savedBackendPairingCode}
            onChange={(event) => setSavedBackendPairingCode(event.target.value)}
            placeholder={gt("PAIRCODE")}
            disabled={isAddingSavedBackend}
            spellCheck={false}
          />
        </label>
      </div>
      <div>
        <span className="mt-1 block text-2xs text-muted-foreground">
          <T>Paste a full pairing URL here to fill both fields automatically.</T>
        </span>
      </div>
    </div>
  );
  const relayRouteOffer =
    routeTarget !== null &&
    !routeTarget.relayManaged &&
    relayDiscoveryState.environments.has(routeTarget.environmentId)
      ? relayDiscoveryState.environments.get(routeTarget.environmentId)!.environment
      : null;
  const addRelayRoute = async () => {
    if (relayRouteOffer === null || routeTarget === null) return;
    setIsAddingSavedBackend(true);
    const result = await registerEnvironment(
      new RelayConnectionRegistration({
        target: new RelayConnectionTarget({
          environmentId: relayRouteOffer.environmentId,
          label: routeTarget.label,
        }),
      }),
    );
    setIsAddingSavedBackend(false);
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        onErrorChange(
          error instanceof Error
            ? (thrownErrorMessage(error, m) ?? error.message)
            : gt("Could not add the route."),
        );
      }
      return;
    }
    handleOpenChange(false);
    toastManager.add({
      type: "success",
      title: gt("Route added"),
      description: gt(
        "{environment} falls back to T3 Connect when its other routes are unreachable.",
        { environment: routeTarget.label },
      ),
    });
  };
  const renderRemoteModeBody = () => (
    <div className="space-y-4">
      {relayRouteOffer !== null ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <p className="text-xs text-muted-foreground">
            <T>This machine is on your T3 Connect account. Use it as a fallback route.</T>
          </p>
          <Button
            size="xs"
            variant="outline"
            disabled={isAddingSavedBackend}
            onClick={() => void addRelayRoute()}
          >
            <T>Add T3 Connect</T>
          </Button>
        </div>
      ) : null}
      {renderRemoteFields()}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Button
        variant="outline"
        className="w-full"
        disabled={isAddingSavedBackend}
        onClick={() => void handleAddSavedBackend()}
      >
        <PlusIcon className="size-3.5" />
        {isAddingSavedBackend
          ? gt("Adding…")
          : routeTarget
            ? gt("Add route")
            : gt("Add environment")}
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger
              render={
                <Button size="xs" variant="ghost-muted" aria-label={gt("Add environment")}>
                  <PlusIcon className="size-3" />
                  <span>
                    <T>Add environment</T>
                  </span>
                </Button>
              }
            />
          }
        />
        <TooltipPopup side="top">
          <T>Add environment</T>
        </TooltipPopup>
      </Tooltip>
      <DialogPopup className="max-h-[80dvh] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {routeTarget
              ? gt("Add a route to {environment}", { environment: routeTarget.label })
              : prefill
                ? gt("Connect to {environment}", { environment: prefill.label })
                : gt("Add Environment")}
          </DialogTitle>
          <DialogDescription>
            {routeTarget
              ? gt(
                  "Pair this machine again over another address, such as its Tailscale name. It joins the existing routes instead of adding a second machine.",
                )
              : prefill
                ? gt(
                    "Create a pairing code on {environment}, in its Settings → Sharing & access or with `t3 auth pairing create`, and enter it here.",
                    { environment: prefill.label },
                  )
                : gt("Pair another environment to this client.")}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>{renderRemoteModeBody()}</DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
