"use server";

import { requireAuth } from "@/app/lib/auth/auth";

export type PackageOption = { label: string; value: number };

const PACKAGE_LIST_URL = `${process.env.API_ENDPOINT_URL}/AuthDataGet/DExecuteJson/8/spHelperService/2`;

const CACHE_TTL_MS = 60_000;
let cache: { options: PackageOption[]; fetchedAt: number } | null = null;

export type ListPackageOptionsResult =
  | { ok: true; options: PackageOption[] }
  | { ok: false; error: string };

export async function listPackageOptions(): Promise<ListPackageOptionsResult> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, options: cache.options };
  }

  const token = await requireAuth();

  let res: Response;
  try {
    res = await fetch(PACKAGE_LIST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({}),
    });
  } catch {
    return { ok: false, error: "Could not reach the package service." };
  }

  if (!res.ok) {
    return { ok: false, error: `Failed to load packages (${res.status}).` };
  }

  const body = await res.json().catch(() => null);

  const rows = JSON.parse(body?.result) || [];

  if (!rows.length) {
    return {
      ok: false,
      error: "No packages found.",
    };
  }

  const options = rows;

  cache = { options, fetchedAt: Date.now() };
  return { ok: true, options };
}
