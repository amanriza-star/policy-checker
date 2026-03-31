const STORAGE_KEY = 'policy-checker-uploads'

/**
 * Load saved uploads from localStorage
 */
export function loadUploads() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

/**
 * Save uploads to localStorage
 */
export function saveUploads(uploads) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(uploads))
  } catch (e) {
    console.error('Ошибка сохранения в localStorage:', e)
  }
}

/**
 * Clear all uploads
 */
export function clearUploads() {
  localStorage.removeItem(STORAGE_KEY)
}
