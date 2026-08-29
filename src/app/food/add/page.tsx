"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession, useT } from "@/components/Providers";
import { MAP_DEFAULTS, type FoodSpotPin } from "@/lib/map";
import {
  Button,
  Card,
  CardBody,
  Field,
  Input,
  LedgerLabel,
  MoneyInput,
  Textarea,
} from "@/components/ui";
import { loginHref } from "@/lib/returnTo";

export default function BanDoThemQuanPage() {
  const t = useT();
  const router = useRouter();
  const { bootstrap } = useSession();
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [priceVnd, setPriceVnd] = React.useState("");
  const [note, setNote] = React.useState("");
  const [clusterSlug, setClusterSlug] = React.useState<"hanoi" | "saigon">("hanoi");
  const [lat, setLat] = React.useState<number | null>(null);
  const [lng, setLng] = React.useState<number | null>(null);
  const [geoError, setGeoError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const preset = clusterSlug === "saigon" ? MAP_DEFAULTS.hcm : MAP_DEFAULTS.hanoi;
    setLat(preset.lat);
    setLng(preset.lng);
  }, [clusterSlug]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoError(t("map.geolocationUnavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoError(null);
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
      },
      () => setGeoError(t("map.geolocationDenied")),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  const submit = useMutation({
    mutationFn: () =>
      api.post<FoodSpotPin>("/food/spots", {
        name: name.trim(),
        address: address.trim(),
        lat: lat!,
        lng: lng!,
        priceVnd,
        clusterSlug,
        note: note.trim() || undefined,
      }),
    onSuccess: (pin) => {
      router.push(`/food/spot/${pin.id}`);
    },
  });

  if (!bootstrap) {
    return (
      <Card>
        <CardBody className="space-y-3">
          <p className="text-sm text-ink-soft">{t("map.loginToContribute")}</p>
          <Link href={loginHref("/food/add")}>
            <Button size="sm">{t("nav.signIn")}</Button>
          </Link>
        </CardBody>
      </Card>
    );
  }

  const canSubmit =
    name.trim().length >= 2 &&
    address.trim().length >= 5 &&
    priceVnd.length > 0 &&
    lat != null &&
    lng != null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header className="space-y-2">
        <LedgerLabel>{t("nav.map")}</LedgerLabel>
        <h1 className="text-2xl">{t("map.contributeTitle")}</h1>
        <p className="text-sm text-ink-soft">{t("map.contributeDescription")}</p>
      </header>

      <Card>
        <CardBody className="space-y-4">
          <Field label={t("map.contributeCity")} htmlFor="cluster">
            <select
              id="cluster"
              className="w-full rounded-[var(--radius-control)] border border-rule bg-paper-raised px-3 py-2 text-sm"
              value={clusterSlug}
              onChange={(e) => setClusterSlug(e.target.value as "hanoi" | "saigon")}
            >
              <option value="hanoi">{t("map.area.hanoi")}</option>
              <option value="saigon">{t("map.area.hcm")}</option>
            </select>
          </Field>

          <Field label={t("map.contributeName")} htmlFor="spot-name">
            <Input id="spot-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label={t("map.contributeAddress")} htmlFor="spot-address">
            <Input id="spot-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>

          <Field label={t("wallet.eat.pricePaid")} htmlFor="spot-price" hint={t("map.contributePriceHint")}>
            <MoneyInput id="spot-price" value={priceVnd} onChange={setPriceVnd} />
          </Field>

          <Field label={t("map.contributeNote")} htmlFor="spot-note">
            <Textarea id="spot-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={useMyLocation}>
              {t("map.nearMe")}
            </Button>
            {lat != null && lng != null && (
              <span className="self-center text-xs text-ink-faint">
                {lat.toFixed(4)}, {lng.toFixed(4)}
              </span>
            )}
          </div>
          {geoError && <p className="text-xs text-caution">{geoError}</p>}

          <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={!canSubmit}>
            {t("map.contributeSubmit")}
          </Button>
        </CardBody>
      </Card>

      <Link href="/food" className="text-sm text-moss-700 hover:underline">
        {t("map.backToMap")}
      </Link>
    </div>
  );
}
