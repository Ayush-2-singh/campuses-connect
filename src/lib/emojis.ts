/**
 * EMOJI SET — what the call's emoji button opens.
 *
 * WhatsApp's picker is the reference: a row of what you just used, then every
 * category on a tab strip, then one tap = send. So the data is grouped the way
 * a phone keyboard groups it rather than one undifferentiated wall of 700
 * characters, and recents are remembered per device.
 *
 * Kept as space-separated strings instead of per-emoji objects: they split in
 * O(n) on first render, cost a fraction of the bytes, and are trivially
 * copy-paste editable when a Unicode release adds a face. No emoji here
 * contains a space (ZWJ sequences and flags are single tokens).
 *
 * SSR-safe: nothing here touches the DOM or storage at module load.
 */

export interface EmojiGroup {
  /** Stable id — also the tab's `data-group`, for tests and CSS. */
  key: string
  label: string
  /** The glyph used on the tab itself, the way a phone keyboard does it. */
  icon: string
  emojis: string[]
}

// Set() rather than a bare split: the lists are hand-maintained, so a pasted
// duplicate must never reach the grid as a second button with the same key.
const split = (emojis: string): string[] => [...new Set(emojis.trim().split(/\s+/))]

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    key: 'smileys',
    label: 'Smileys',
    icon: '😀',
    emojis: split(`
      😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚
      😋 😛 😝 🤪 🤨 🤔 🤭 🤫 😶 😐 😑 😬 🙄 😯 😴 🤤 😪 😮 😵 🥴
      😕 🙁 ☹️ 😣 😖 😞 😟 😤 😢 😭 😦 😧 😨 😩 🥺 😡 🤬 😳 🥵 🥶
      😱 🤯 🥸 😈 👿 💀 ☠️ 👻 🤖 👾 💤 💦 💨 🫠 🫣 🫢 🫥 🫡 🫤 🫩
      🤠 👽 🕺 💃 😎 🤓 🧐 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤗 🤔 🙃
    `),
  },
  {
    key: 'people',
    label: 'People',
    icon: '🤚',
    emojis: split(`
      👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋
      🤝 🙏 💪 🦾 ✍️ 💅 👏 🙌 👐 🤲 ✊ 👊 🫰 🫱 🫲 🫵 🫶 👏
      🫷 🫸 🤲 🤛 🤜 🤞 🤘 🤙 🫰
      👨 👩 👦 👧 🧑 👶 🧒 🧓 👱 👴 👩‍🦰 👨‍🦰 👩‍🦱 👨‍🦱 👩‍🦳 👨‍🦳 👨‍🦲 👩‍🦲 🧔
      👨‍👩‍👧 👨‍👩‍👦 👨‍👩‍👧‍👦 👪 👫 👭 👧 👦
      🧠 🫀 🫁 🦴 👁️ 👄 👅 🦷 👣 🤰 🧒
    `),
  },
  {
    key: 'nature',
    label: 'Animals',
    icon: '🐶',
    emojis: split(`
      🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🐔 🐧 🐦 🐤 🐣 🐥
      🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🪳 🕷️ 🦂
      🐢 🐍 🐙 🦑 🦀 🐡 🐠 🐟 🐬 🐳 🦈 🐊 🐅 🐆 🦒 🦓 🐘 🦍 🐪 🐫 🦙
      🐄 🐂 🐃 🐑 🐐 🐓 🦃 🕊️ 🐇 🦌 🐕 🐈 🐩 🐈‍⬛ 🐾
      🌸 🌷 🌹 🌺 🌻 🌼 🌾 🌿 🍀 🍁 🍂 🍃 🌵 🌴 🌳 🌲 🌱 🍄
      ☀️ 🌞 🌝 🌛 🌜 🌙 ⭐ 🌟 ✨ ⚡ 🔥 ☀️ ☁️ ⛅ 🌦️ 🌧️ ⛈️ 🌪️ 🌈 ❄️ 💧 🌊 🌍 🌎 🌏
    `),
  },
  {
    key: 'food',
    label: 'Food',
    icon: '🍔',
    emojis: split(`
      🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍑 🍒 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌽 🌶️ 🫑 🧄 🧅 🥔 🍠 🥕
      🌰 🥜 🥑 🍞 🥐 🥖 🫓 🥯 🍕 🍔 🍟 🌭 🥪 🌮 🌯 🌮 🥙 🧆 🍳 🍳 🥞 🧇 🧀 🥚 🍛 🍜 🍚 🍣 🍥 🥠 🍢
      🍿 🍩 🍪 🎂 🍰 🧁 🥮 🍫 🍬 🍭 🍯 🥛 ☕ 🍵 🧃 🥤 🍺 🍻 🥂 🍷 🍸 🍹 🧊 🍦 🍨 🍧
    `),
  },
  {
    key: 'travel',
    label: 'Travel',
    icon: '✈️',
    emojis: split(`
      🚗 🚕 🚌 🚎 🏎️ 🚓 🚑 🚒 🚲 🛵 🏍️ 🛺 🚚 🚜 🛴 🛹
      ✈️ 🛩️ 🚀 🛸 🚁 ⛵ 🛥️ 🚢 ⛽ 🚧 🚦 🗺️ 📍 🗿 🗽 🏰 🏯 🗼 🏛️ 🎡 🎢 🎠
      🏖️ ⛰️ 🏔️ 🌋 🏕️ 🏝️ 🏜️ 🌇 🌆 🌃 🌉 🏙️ 🌅 🌄 🚪 🛗 🛤️ ⛰️
    `),
  },
  {
    key: 'activities',
    label: 'Activities',
    icon: '⚽',
    emojis: split(`
      ⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🥅 🎱 🥏 🪀 🏓 🏸 ⛳ 🏹 🎣 🤿 🛹 🛼 ⛸️ 🎿 🛷 🥌 🎳 🎯 🪁
      🎮 🕹️ 🎲 🧩 ♟️ 🎴 🎭 🎨 🖌️ 🖼️ 🎻 🎸 🎹 🎺 🎷 🥁 🎤 🎧 📻 🪘
      🎉 🎊 🎈 🎁 🎄 🎅 🎆 🎇 🎌 🏆 🥇 🥈 🥉 🎖️ 🏵️ 🎗️ 🎪 🎫 🎟️ 🎡
    `),
  },
  {
    key: 'objects',
    label: 'Objects',
    icon: '💡',
    emojis: split(`
      ⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 📷 📸 📹 📺 📻 🎙️ ⏱️ ⏲️ ⏰ 🕰️ 💡 🔦 🕯️
      📕 📗 📘 📙 📚 📒 📓 📔 📰 📄 📃 📊 📈 📉 📋 📁 📂 📌 📎 🔗 📏 📐
      ✏️ 🖊️ 🖋️ 📝 🔍 🔎 🔏 🔐 🔑 🔨 🪓 ⚙️ 🔧 🔩 ⛓️ 🧲 💣 🚬 ⚰️ 🪦
      🚽 🚿 🛁 🪥 🧼 🧽 🧴 🛎️ 🧺 🧹 🪣 🛏️ 🛌 🧸 🪞 🪟 🛒 🎁 💊 🩹 🩺 🚬 🪪 🪫 🔋 📶 📡 🔌 💻
    `),
  },
  {
    key: 'symbols',
    label: 'Symbols',
    icon: '❤️',
    emojis: split(`
      ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ❤️‍🔥
      ✅ ❌ ❗ ❓ 💯 🔔 🔕 ♻️ 🔱 ⚛️ ☢️ ☯️ ♿ ⚫ ⚪ 🔴 🟠 🟡 🟢 🔵 🟣 🟤
      ▪️ ◾ 🔺 🔻 ⬆️ ⬇️ ⬅️ ➡️ ↗️ ↘️ ↙️ ↖️ 🔀 🔁 🔂 ▶️ ⏸️ ⏹️ ⏭️ ⏮️ 🔝 🔚 🔝
      ➕ ➖ ✖️ ➗ ♾️ 💱 💲 ™️ ©️ ®️ ❕ ❔ ⚠️ 🚫 ⛔ ✳️ ✴️ ❇️ 〰️ ➰ ➿ 🕐 🕑 🕒 🕓 🕔 🕕 🕖 🕗 🕘 🕙 🕚 🕛
      🔟 #️⃣ *️⃣ 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔠 🔡 🔢 🔣 🔤
      ☪️ ✡️ ☸️ ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓
    `),
  },
  {
    key: 'flags',
    label: 'Flags',
    icon: '🏁',
    emojis: split(`
      🏁 🚩 🏳️ 🏳️‍🌈 🏳️‍⚧️
      🇮🇳 🇺🇸 🇬🇧 🇨🇦 🇦🇺 🇳🇿 🇩🇪 🇫🇷 🇮🇹 🇪🇸 🇵🇹 🇧🇷 🇦🇷 🇨🇱 🇨🇴 🇵🇪 🇲🇽 🇻🇪 🇺🇾 🇪🇨
      🇷🇺 🇨🇳 🇯🇵 🇰🇷 🇹🇼 🇸🇬 🇲🇾 🇮🇩 🇹🇭 🇻🇳 🇵🇭 🇲🇲 🇰🇭 🇱🇦
      🇦🇪 🇸🇦 🇶🇦 🇹🇷 🇮🇱 🇯🇴 🇮🇶 🇮🇷 🇵🇰 🇧🇩 🇳🇵 🇱🇰 🇦🇫
      🇿🇦 🇳🇬 🇰🇪 🇪🇬 🇬🇭 🇸🇳 🇲🇦 🇹🇳 🇪🇹 🇹🇿 🇺🇬 🇨🇲
      🇳🇱 🇧🇪 🇨🇭 🇦🇹 🇩🇪 🇸🇪 🇳🇴 🇩🇰 🇫🇮 🇮🇪 🇬🇧 🇫🇷 🇮🇹 🇪🇸
      🇵🇱 🇺🇦 🇷🇴 🇧🇬 🇭🇷 🇷🇸 🇨🇿 🇸🇰 🇭🇺 🇬🇷 🇩🇪 🇱🇺
      🇺🇸 🇨🇦 🇬🇹 🇨🇺 🇯🇲 🇹🇹 🇵🇦 🇩🇴 🇧🇴 🇵🇾 🇨🇷
    `),
  },
]

/** Total characters in the picker — shown nowhere, asserted in tests. */
export const EMOJI_COUNT = EMOJI_GROUPS.reduce((n, group) => n + group.emojis.length, 0)

/** How many the "recent" row remembers — enough for a burst, never a wall. */
const RECENTS_MAX = 24
const RECENTS_KEY = 'cc-emoji-recent'

/**
 * The last emojis tapped, newest first. Empty (and never throws) during SSR
 * or with storage blocked — the picker just opens straight on Smileys.
 */
export function readEmojiRecents(): string[] {
  try {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem(RECENTS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as unknown
    return Array.isArray(list) ? list.filter((e): e is string => typeof e === 'string').slice(0, RECENTS_MAX) : []
  } catch {
    return [] // private browsing / disabled storage — recents simply don't persist
  }
}

/** Put `emoji` at the head of recents and persist the new list. */
export function rememberEmoji(emoji: string): string[] {
  const next = [emoji, ...readEmojiRecents().filter((e) => e !== emoji)].slice(0, RECENTS_MAX)
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch {
    /* storage blocked — the in-memory list still works for this session */
  }
  return next
}
