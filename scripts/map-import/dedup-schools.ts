#!/usr/bin/env tsx
/**
 * Re-classify OSM schools and merge duplicate universities (wikidata ↔ OSM, or same name within 200 m).
 * Usage: pnpm map:import:dedup [--dry-run]
 */
import type { FoodSpotSource, SchoolKind } from "@prisma/client";
import { prisma } from "../../src/server/db";
import { distanceMeters } from "./geo";
import { classifySchoolByName } from "./osm-parse";

const DEDUP_RADIUS_M = 200;

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceRank(source: FoodSpotSource): number {
  if (source === "openstreetmap") return 0;
  if (source === "wikidata") return 1;
  return 2;
}

type SchoolRow = {
  id: string;
  source: FoodSpotSource;
  kind: SchoolKind;
  lat: number | null;
  lng: number | null;
  normName: string;
};

function areDuplicates(a: SchoolRow, b: SchoolRow): boolean {
  if (a.normName !== b.normName) return false;

  const crossSource =
    (a.source === "wikidata" && b.source === "openstreetmap") ||
    (a.source === "openstreetmap" && b.source === "wikidata");
  if (crossSource) return true;

  if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
    return distanceMeters(a.lat, a.lng, b.lat, b.lng) <= DEDUP_RADIUS_M;
  }

  return false;
}

function findDuplicateGroups(schools: SchoolRow[]): SchoolRow[][] {
  const n = schools.length;
  const parent = schools.map((_, i) => i);

  function find(i: number): number {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    let cur = i;
    while (parent[cur] !== cur) {
      const next = parent[cur]!;
      parent[cur] = root;
      cur = next;
    }
    return root;
  }

  function union(i: number, j: number): void {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (areDuplicates(schools[i]!, schools[j]!)) union(i, j);
    }
  }

  const groups = new Map<number, SchoolRow[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(schools[i]!);
  }

  return [...groups.values()].filter((g) => g.length > 1);
}

function pickKeeper(group: SchoolRow[]): SchoolRow {
  return [...group].sort((a, b) => sourceRank(a.source) - sourceRank(b.source))[0]!;
}

async function reclassifyOsmSchools(dryRun: boolean): Promise<number> {
  const schools = await prisma.school.findMany({
    where: { source: "openstreetmap" },
    include: { translations: { where: { locale: "vi" }, take: 1 } },
  });

  let reclassified = 0;
  for (const school of schools) {
    const name = school.translations[0]?.name ?? "";
    const newKind = classifySchoolByName(name);
    if (!newKind || newKind === school.kind) continue;

    reclassified++;
    if (!dryRun) {
      await prisma.school.update({
        where: { id: school.id },
        data: { kind: newKind },
      });
    }
  }
  return reclassified;
}

async function mergeDuplicateIntoKeeper(
  duplicateId: string,
  keeperId: string,
  dryRun: boolean,
): Promise<void> {
  const links = await prisma.foodSpotSchool.findMany({ where: { schoolId: duplicateId } });

  for (const link of links) {
    const existing = await prisma.foodSpotSchool.findUnique({
      where: { spotId_schoolId: { spotId: link.spotId, schoolId: keeperId } },
    });

    if (dryRun) continue;

    if (existing) {
      await prisma.foodSpotSchool.delete({
        where: { spotId_schoolId: { spotId: link.spotId, schoolId: duplicateId } },
      });
    } else {
      await prisma.foodSpotSchool.update({
        where: { spotId_schoolId: { spotId: link.spotId, schoolId: duplicateId } },
        data: { schoolId: keeperId },
      });
    }
  }

  if (dryRun) return;

  await prisma.schoolTranslation.deleteMany({ where: { schoolId: duplicateId } });
  await prisma.school.delete({ where: { id: duplicateId } });
}

async function deduplicateUniversities(dryRun: boolean): Promise<{ merged: number; deleted: number }> {
  const universities = await prisma.school.findMany({
    where: { kind: "UNIVERSITY" },
    include: { translations: { where: { locale: "vi" }, take: 1 } },
  });

  const byName = new Map<string, SchoolRow[]>();
  for (const u of universities) {
    const normName = normalizeName(u.translations[0]?.name ?? "");
    if (!normName) continue;
    const row: SchoolRow = {
      id: u.id,
      source: u.source,
      kind: u.kind,
      lat: u.lat,
      lng: u.lng,
      normName,
    };
    const bucket = byName.get(normName) ?? [];
    bucket.push(row);
    byName.set(normName, bucket);
  }

  let merged = 0;
  let deleted = 0;
  const removed = new Set<string>();

  for (const group of byName.values()) {
    if (group.length < 2) continue;

    const active = group.filter((s) => !removed.has(s.id));
    if (active.length < 2) continue;

    for (const dupGroup of findDuplicateGroups(active)) {
      const keeper = pickKeeper(dupGroup);
      const duplicates = dupGroup.filter((s) => s.id !== keeper.id);
      if (!duplicates.length) continue;

      for (const dup of duplicates) {
        if (removed.has(dup.id)) continue;
        await mergeDuplicateIntoKeeper(dup.id, keeper.id, dryRun);
        removed.add(dup.id);
        merged++;
        deleted++;
      }
    }
  }

  return { merged, deleted };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("Dry run — no database writes");

  const reclassified = await reclassifyOsmSchools(dryRun);
  const { merged, deleted } = await deduplicateUniversities(dryRun);

  console.log(
    JSON.stringify({ reclassified, merged, deleted, dryRun }, null, 2),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
