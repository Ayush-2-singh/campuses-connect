export function getSafeRedirect(value: string | null | undefined, fallback = '/feed'): string {
  const candidate = (value || '').trim()
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.startsWith('/auth')) {
    return fallback
  }
  return candidate
}

export function getAuthErrorMessage(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid login credentials')) return 'Email or password is incorrect.'
  if (normalized.includes('email not confirmed')) return 'Please verify your email before signing in.'
  if (normalized.includes('user already registered')) return 'An account with this email already exists. Try signing in.'
  if (normalized.includes('password should be at least')) return 'Use a stronger password with at least 8 characters.'
  return message
}

export function getPasswordError(password: string): string {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Use at least one uppercase letter, one lowercase letter, and one number.'
  }
  return ''
}
