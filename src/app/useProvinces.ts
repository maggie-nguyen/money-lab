"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface ProvinceOption {
  key: string;
  label: string;
}

/** Shared by the signup and settings forms so the list has one source of truth. */
export function useProvinces() {
  return useQuery({
    queryKey: ["meta", "provinces"],
    queryFn: () => api.get<ProvinceOption[]>("/meta/provinces"),
    staleTime: Infinity,
  });
}
