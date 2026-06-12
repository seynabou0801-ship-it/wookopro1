/**
 * Open WhatsApp with a specific phone number and optional message
 * @param phone - Phone number (will be cleaned of non-numeric characters)
 * @param text - Optional pre-filled message
 */
export function openWhatsApp(phone, text) {
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const encodedText = encodeURIComponent(text || "");
  const url = `https://wa.me/${cleanPhone}${encodedText ? `?text=${encodedText}` : ""}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Get the default WhatsApp number from environment
 */
export function getDefaultWhatsAppNumber() {
  return process.env.NEXT_PUBLIC_DEFAULT_WHATSAPP_NUMBER || "+33777369462";
}

/**
 * Generate WhatsApp URL without opening
 * @param phone - Phone number
 * @param text - Optional pre-filled message
 */
export function getWhatsAppUrl(phone, text) {
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const encodedText = encodeURIComponent(text || "");
  return `https://wa.me/${cleanPhone}${encodedText ? `?text=${encodedText}` : ""}`;
}
