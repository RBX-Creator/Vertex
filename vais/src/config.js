// Betreiber-Angaben (Impressum) und Admins – per Umgebungsvariablen änderbar
export const OWNER = {
  name: process.env.OWNER_NAME?.trim() || 'Leeam Thiemann',
  email: process.env.OWNER_EMAIL?.trim() || 'leeam.thiemann18@gmail.com',
  address: process.env.IMPRESSUM_ADDRESS?.trim() || '', // z. B. "Musterstraße 1, 12345 Musterstadt"
};

// Admins: Konten mit diesen E-Mail-Adressen (durch Komma getrennt)
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || OWNER.email)
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

export const isAdmin = (user) => !!user && ADMIN_EMAILS.includes(String(user.email).toLowerCase());
