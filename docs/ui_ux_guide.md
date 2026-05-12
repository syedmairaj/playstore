# PlayStore.xyz UI/UX & Design System

## 1. Visual Language
- **Base Theme:** Deep Dark Mode.
- **Background Color:** `#0B0E14` (Midnight Slate).
- **Primary Accent:** `#34A853` (PlayStore Green) - Used for primary CTAs and "Success" states.
- **Secondary Accent:** `#4285F4` (Google Blue) - Used for highlighting technical ASO features.
- **Surface Color:** `rgba(255, 255, 255, 0.05)` with 12px Backdrop Blur (Glassmorphism).

## 2. The "Live Preview" Mockup (Crucial Component)
The dashboard must feature a persistent **Mobile Phone Frame** on the right side.
- **ASO Mode:** Display text inside a simulated Google Play Store listing (Icon, Title, Install Button, Description).
- **Ad Copy Mode:** Display text inside a Facebook/TikTok ad card mockup.
- **Push Mode:** Display text on a phone Lock Screen notification bubble.

## 3. Layout Components
- **Bento Grid (Landing Page):** Content should be organized in rounded cards (24px radius) with subtle 1px borders.
- **Dashboard Sidebar:** Slim, iconic navigation.
- **Credit Pill:** A glowing pill in the header showing remaining credits: `⚡ 12 Credits`.

## 4. Interaction Patterns
- **Typing Effect:** Use a custom hook to simulate the AI "writing" the content into the mobile preview.
- **Laser Scan:** A horizontal glowing green line that moves up and down the mobile mockup while the AI is processing.
- **Copy Feedback:** When a user copies text, show a "Checkmark" animation and a toast notification: "Optimized for Play Store!"
