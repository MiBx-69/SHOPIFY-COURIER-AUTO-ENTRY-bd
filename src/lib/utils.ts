import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...values: ClassValue[]) => twMerge(clsx(values));
export const money = (minor: number, currency = "BDT") => new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
