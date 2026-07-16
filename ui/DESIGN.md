---
name: LLMSenpai
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fb'
  on-surface: '#111c2d'
  on-surface-variant: '#464554'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#767586'
  outline-variant: '#c7c4d7'
  surface-tint: '#494bd6'
  primary: '#4648d4'
  on-primary: '#ffffff'
  primary-container: '#6063ee'
  on-primary-container: '#fffbff'
  inverse-primary: '#c0c1ff'
  secondary: '#795900'
  on-secondary: '#ffffff'
  secondary-container: '#ffc329'
  on-secondary-container: '#6f5100'
  tertiary: '#006949'
  on-tertiary: '#ffffff'
  tertiary-container: '#00855d'
  on-tertiary-container: '#f5fff7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#ffdf9f'
  secondary-fixed-dim: '#f9bd22'
  on-secondary-fixed: '#261a00'
  on-secondary-fixed-variant: '#5c4300'
  tertiary-fixed: '#68fcbf'
  tertiary-fixed-dim: '#45dfa4'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  display-lg:
    fontFamily: Outfit
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Outfit
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 42px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Outfit
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  body-lg:
    fontFamily: Outfit
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Outfit
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-bold:
    fontFamily: Outfit
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Outfit
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  base-unit: 4px
  container-padding: 24px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style
The brand personality is energetic, approachable, and high-spirited, designed to feel like a welcoming mentor within a vibrant club environment. The design system adopts a **Pop-Minimalist** style: it combines clean layouts with exuberant splashes of color and exaggerated soft forms. 

The aesthetic is "bubbly" but functional, prioritizing an emotional response of optimism and ease of use. Interaction patterns should feel springy and responsive, utilizing a mix of bold typography and soft, tactile surfaces to create an interface that feels more like a creative tool than a corporate utility.

## Colors
The palette is anchored by a vibrant **Electric Indigo** (#6366f1) as the primary brand color. To achieve the "Pop" aesthetic, two high-energy accents are introduced:
- **Amber Sun** (#fbbf24): Used for highlights, promotional call-outs, and "star" moments.
- **Mint Fizz** (#34d399): Reserved for success states and secondary actions that require a fresh, positive feel.

The background uses a soft, off-white (#f8fafc) to allow the vibrant primary and secondary colors to stand out without causing visual fatigue. Text remains high-contrast using a deep slate neutral for maximum legibility.

## Typography
This design system utilizes **Outfit** across all levels to leverage its rounded, geometric terminals which reinforce the friendly "Pop" tone. 

Headlines are set with heavy weights (ExtraBold/Bold) and tighter letter spacing to create a high-impact, graphic look. Body copy remains at a Medium or Regular weight to ensure accessibility. For "Pop" emphasis, specific labels or short phrases can be set in uppercase with increased letter-spacing to act as stylistic anchors within the UI.

## Layout & Spacing
The layout follows a **Fluid Grid** model with generous internal padding to create a sense of airiness and "bounce." 

On desktop, a 12-column grid is used with wide gutters (24px) to prevent the UI from feeling cramped. For mobile, the grid collapses to 4 columns with 16px side margins. Spacing between elements should favor larger gaps (using the `stack-lg` token) to maintain the playful, unhurried pace of the brand. Components should never feel crowded; white space is treated as a primary design element.

## Elevation & Depth
Depth is created through **Ambient Shadows** that are soft, wide, and slightly tinted with the primary indigo color. This prevents shadows from looking "dirty" or grey.

Instead of traditional elevation levels, this design system uses "Depth Tiers":
1.  **Flat Tier:** Items resting on the background (e.g., input fields) have a subtle 1px border in a lightened indigo.
2.  **Raised Tier:** Interactive cards and buttons use a soft, diffused shadow (`0 10px 25px -5px rgba(99, 102, 241, 0.15)`).
3.  **Active Tier:** On hover or click, elements should physically "lift" (move -2px on the Y-axis) and the shadow should become slightly more pronounced.

## Shapes
The shape language is defined by extreme **Pill-shaped** and bubbly corners. By setting a base roundedness of 1rem (16px), even small components like tags and buttons feel soft to the touch. Large containers and cards should use `rounded-xl` (48px) to create a distinct, friendly silhouette that differentiates the product from standard "square" corporate software.

## Components

- **Buttons:** Use a "squishy" feel. Primary buttons are solid Indigo with white text. On hover, they scale slightly (1.02x) and use a brighter Indigo. Secondary buttons use a thick 2px border and high-contrast text.
- **Chips & Tags:** Fully pill-shaped with background colors at 10% opacity of the primary or secondary colors.
- **Lists:** List items are separated by generous spacing and sit on individual white cards with rounded corners, rather than simple dividers.
- **Checkboxes & Radio Buttons:** Oversized and highly rounded. Use the secondary Amber color for the check state to provide a satisfying "Pop" of color.
- **Input Fields:** Soft grey backgrounds with 16px rounded corners. On focus, the border transitions to a thick 2px Indigo with a soft glow effect.
- **Cards:** Use large corner radii (32px or 48px). Ensure that internal padding is consistent with the external corner radius to maintain visual harmony.
- **Interactive States:** Every interactive element must have a visible hover state—typically a combination of a slight vertical lift and a subtle color shift to the accent palette.