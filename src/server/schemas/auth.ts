import { z } from "zod";
import { isProvinceKey } from "@/server/lib/meta";

export const passwordSchema = z
  .string()
  .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
  .max(128);

export const displayNameSchema = z.string().trim().min(2).max(40);

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  displayName: displayNameSchema,
  birthYear: z.number().int().min(1940).max(2020).optional(),
  province: z
    .string()
    .trim()
    .max(50)
    .refine(isProvinceKey, "Tỉnh/thành không hợp lệ") // enum, not free text (doc 01 §9.1)
    .optional(),
  localePref: z.enum(["vi", "en"]).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

export const googleSchema = z.object({
  idToken: z.string().min(10).max(4096),
  localePref: z.enum(["vi", "en"]).optional(),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(10).max(512) });

export const logoutSchema = z.object({
  refreshToken: z.string().min(10).max(512).optional(),
  allDevices: z.boolean().optional(),
});

export const verifyEmailSchema = z.object({ token: z.string().min(10).max(512) });

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(512),
  newPassword: passwordSchema,
});
