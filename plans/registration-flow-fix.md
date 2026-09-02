# Registration Flow Fix Plan

## Files to Modify
- `frontend/src/app/(auth)/register/page.tsx` — all 9 fixes

---

## 1. CAPTCHA — Fix Loading/Rendering

**Root Cause:**
The `fetchCaptcha` function has an empty `catch` block (lines 137-139) that silently swallows ALL errors. When the backend is unreachable or returns an error, the UI stays permanently stuck on "Loading CAPTCHA...". Additionally, the `captchaRequestedRef` guard prevents re-fetching if the CAPTCHA was requested but failed.

**Fix:**
- Replace empty `catch` block with proper error state
- Add `captchaError` state variable
- Show error message with retry button when CAPTCHA fails
- Add proper error state in the CAPTCHA render section
- Auto-retry on error with exponential backoff disabled (user-initiated only)

```tsx
// New state
const [captchaError, setCaptchaError] = React.useState<string | null>(null);

// fetchCaptcha updated catch
} catch (err) {
  setCaptchaError('Failed to load CAPTCHA. Please try again.');
  setCaptcha(null);
} finally {
  setCaptchaLoading(false);
}
```

---

## 2. DPDP Act + Privacy Policy Checkbox UX

**Current:** Basic `<input type="checkbox">` with default styling

**Fix:** Add subtle scale animation on check/uncheck using CSS transitions on the checkbox element itself. No layout shift.

```tsx
// Inline style or CSS class
const checkboxClass = `h-5 w-5 rounded border-slate-300 text-primary 
  focus:ring-primary shrink-0 
  transition-transform duration-150 ease-out 
  cursor-pointer
  ${errors.dpdpConsent ? 'border-rose-400' : ''}`;

// Same for privacyPolicyAccepted
```

---

## 3. Multi-Step Scroll Position

**Current:** Lines 164 and 167 have `window.scrollTo({ top: 0, behavior: 'smooth' })`

**Fix:** Remove BOTH `window.scrollTo` calls entirely from `goNext` and `goBack` functions. This preserves the user's scroll position between steps.

```tsx
// Before
const goNext = async () => {
  const ok = await trigger(fields[currentStep] ?? []);
  if (ok) { setCurrentStep((s) => Math.min(s + 1, 3)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
};

// After
const goNext = async () => {
  const ok = await trigger(fields[currentStep] ?? []);
  if (ok) { setCurrentStep((s) => Math.min(s + 1, 3)); }
};
```

---

## 4. Mobile Action Buttons — Consistent Width

**Current:** Inconsistent flex behavior across step action areas

**Fix:** Apply `w-full sm:w-auto sm:flex-1` to both buttons in a `flex flex-col sm:flex-row` container. On mobile they stack full-width; on sm+ they share equal space.

```tsx
<div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
  <Button className="w-full sm:flex-1" ...>Back</Button>
  <Button className="w-full sm:flex-1" ...>Continue</Button>
</div>
```

---

## 5. Button Text + Animated Arrow

**Current:** Various button labels; no hover animation on arrows

**Fix:**
- Step 1 Continue: "Continue to Step 2" ✓ (already correct)
- Step 2 Back: "Back" ✓ (already correct)
- Step 2 Continue: "Continue to Step 3" ✓ (already correct)
- Step 3 Back: "Back" ✓ (already correct)
- Step 3 Submit: "Submit Registration" ✓ (already correct)

For arrow animation, add CSS via Tailwind's `group` and `group-hover`:

```tsx
<Button 
  rightIcon={
    <span className="inline-block transition-transform duration-150 group-hover:translate-x-0.5">
      <ArrowRight className="h-5 w-5" />
    </span>
  }
>
```

Add `group` class to the Button component or wrap in a span with group.

---

## 6. Confirm Password — Copy Password Into Confirm Field

**Fix:** Add an icon button inside/next to the Confirm Password field that copies the password value to confirm password state.

```tsx
// Inside FormField for confirmPassword
<div className="relative">
  <input id="confirmPassword" {...register('confirmPassword')} type="password" ... />
  <button
    type="button"
    aria-label="Use password"
    title="Use password"
    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 
      hover:text-slate-600 transition-colors duration-150"
    onClick={() => {
      const pw = watch('password');
      if (pw) setValue('confirmPassword', pw, { shouldValidate: true, shouldTouch: true });
    }}
  >
    <Copy className="h-4 w-4" />
  </button>
</div>
```

Import `Copy` from lucide-react.

---

## 7. Mobile Number Field — +91 Prefix

**Fix:** Add a prefix span inside the mobile input field with the +91 country code.

```tsx
<FormField label="Mobile Number" htmlFor="mobile" required error={errors.mobile?.message} hint="10-digit mobile number">
  <div className="relative">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 
      text-sm font-semibold text-slate-600 pointer-events-none">
      +91
    </span>
    <input 
      id="mobile" 
      {...register('mobile')} 
      className={`${fieldInputClass(!!errors.mobile)} pl-10`}
      placeholder="9876543210"
      inputMode="tel"
      autoComplete="tel"
    />
  </div>
</FormField>
```

Also update Zod validation to strip leading +91 if user pastes it:
```tsx
mobile: z.string()
  .transform(v => v.replace(/^\+91/, ''))  // strip +91 prefix
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
```

---

## 8. General UI Quality

Keep existing design language. All animations will be lightweight, avoid layout shifts, respect `prefers-reduced-motion`.

---

## 9. Existing Functionality Preservation

- All form fields preserved
- All validation preserved (Zod schema unchanged except mobile transform)
- CAPTCHA verification preserved
- Password hashing unchanged
- API requests unchanged
- Consent validation unchanged
- Multi-step state management unchanged

---

## 10. Build Verification

Run after changes:
```bash
cd frontend
npm run lint
npm run build
```

---

## Summary

| # | Fix | File | Impact |
|---|-----|------|--------|
| 1 | CAPTCHA error state | `register/page.tsx` | Fixes "Loading CAPTCHA..." stuck state |
| 2 | Checkbox animation | `register/page.tsx` | UX polish, no functional change |
| 3 | Remove scroll jump | `register/page.tsx` | User scroll position preserved |
| 4 | Equal button widths | `register/page.tsx` | Consistent mobile layout |
| 5 | Arrow animation | `register/page.tsx` | Hover polish on buttons |
| 6 | Copy password icon | `register/page.tsx` | New UX feature, no clipboard |
| 7 | +91 prefix UI | `register/page.tsx` | Better mobile UX, Zod transform |
| 8 | Build verification | — | Confirm no breaking changes |
