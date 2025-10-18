# AlienProbe.ai "Hunter Brody" Design Guidelines

## Design Approach
**Hybrid System**: Material Design dashboard architecture with sci-fi mission control customization. Drawing inspiration from SpaceX mission control interfaces, sci-fi HUDs (Prometheus, The Expanse), and modern SaaS platforms like Linear and Vercel.

**Core Philosophy**: Data-dense interfaces don't need to be boring. Create visual hierarchy through strategic use of glowing accents, animated data flows, and depth layers that feel like looking at multiple holographic screens.

## Color Palette

**Dark Mode Foundation** (entire platform):
- Background Base: 220 25% 8%
- Surface Elevated: 220 22% 12%
- Surface Highest: 220 20% 16%

**Accent Colors**:
- Primary (Alien Cyan): 180 85% 55%
- Warning (Plasma Orange): 25 95% 60%
- Success (Probe Green): 140 70% 50%
- Data Stream (Electric Purple): 270 75% 65%

**Status Indicators**:
- Active Glow: 180 100% 60% with 0 0% 0% / 0.4 shadow
- Processing: 270 75% 65% pulsing
- Error: 0 85% 60%

## Typography

**Fonts** (via Google Fonts):
- Primary: 'Inter' (UI, body text) - 400, 500, 600, 700
- Display: 'Orbitron' (headings, mission callouts) - 600, 700, 900
- Mono: 'JetBrains Mono' (data, timestamps) - 400, 500

**Scale**:
- Display: text-4xl to text-5xl (Orbitron)
- Headings: text-xl to text-2xl (Orbitron)
- Body: text-sm to text-base (Inter)
- Data Labels: text-xs (JetBrains Mono)

## Layout System

**Spacing Primitives**: Tailwind units 2, 4, 6, 8, 12, 16, 24
**Container Strategy**: Full-bleed dashboard with max-w-screen-2xl inner container, 4-column grid system (sm:2, lg:4) for metrics and cards

**Viewport Structure**:
- Sidebar Navigation: Fixed 64px collapsed, 240px expanded
- Main Content: Scrollable with sticky header
- Activity Feed: Fixed right panel 320px (collapsible on mobile)

## Component Library

**Navigation Sidebar**:
- Dark glass-morphism effect (backdrop-blur-xl, bg-opacity-60)
- Vertical icon menu with hover tooltips
- Active state: Cyan glow line (border-l-2) + icon color shift
- Sections: Dashboard, Activity, Pricing, Automation, Workflows, Settings

**Real-time Activity Feed**:
- Card-based entries with left accent bar (color-coded by activity type)
- Timestamp in mono font, fade-in animation for new items
- Animated pulse dot for "live" activities
- Grouping by time: "Now", "Last 5min", "Earlier Today"
- Each card: Icon + Activity description + Source + Timestamp
- Background: Subtle gradient from surface to transparent

**Dashboard Metrics Cards**:
- Grid layout (grid-cols-1 md:grid-cols-2 lg:grid-cols-4)
- Glass card: backdrop-blur, border with cyan/purple gradient
- Large metric number (text-3xl Orbitron) + label + trend indicator
- Animated counter effect on value changes
- Mini sparkline charts (optional data viz)
- Glow effect on hover: shadow-[0_0_20px_rgba(color)]

**Pricing Management Dashboard**:
- Table with alternating row backgrounds
- Editable cells with inline editing state (glow focus)
- Action buttons: Icon-only with tooltips (edit, delete, copy)
- Add new tier: Prominent card with dashed border + plus icon
- Tier comparison view: Side-by-side cards with feature checklists

**System Settings Panel**:
- Accordion sections with smooth expand/collapse
- Toggle switches: Cyan when active with glow animation
- Input fields: Dark with cyan focus ring, mono font for API keys
- Section headers: Small caps with underline glow effect
- Save button: Sticky bottom bar with success confirmation animation

**Email Automation Controls**:
- Visual workflow builder: Node-based interface
- Cards for each automation trigger/action
- Connection lines with animated flow particles
- Schedule picker: Calendar UI with time slots highlighted
- Template preview: Split view (editor + preview pane)
- Send test: Button with loading state showing transmission animation

**Workflow Builder**:
- Drag-drop canvas with grid background (subtle dots)
- Node types: Trigger (octagon), Action (rectangle), Condition (diamond)
- Connector lines: Animated dashed lines with direction arrows
- Toolbox sidebar: Icon grid of available actions
- Properties panel: Right sidebar for selected node configuration

**Buttons & Controls**:
- Primary: Solid cyan background, bold font, hover brightness increase
- Secondary: Outlined cyan, transparent background
- Danger: Outlined red, hover fill
- Ghost: No border, hover background subtle
- Loading state: Spinner + "Processing..." text

**Data Visualization**:
- Line charts: Cyan/purple gradients with glow effect
- Bar charts: Gradient fills with rounded tops
- Pie/donut: Segment separation with glow between sections
- Axis labels: Mono font, muted color
- Tooltips: Glass card with blur, fade-in animation

## Animations

**Activity Feed**:
- New item: Slide in from right + fade in (300ms)
- Live indicator: Pulse animation (2s infinite)

**Dashboard Load**:
- Metrics: Stagger animation (100ms delay between cards)
- Charts: Draw animation from left to right

**Status Changes**:
- Success: Green glow pulse (500ms)
- Error: Red shake + pulse (300ms)
- Processing: Cyan shimmer across element

**Workflow Connections**:
- Flow particles: Moving dots along connection lines (3s loop)

## Images

**No Large Hero**: This is a utility dashboard - no landing page needed. All imagery is functional:

1. **Empty States**: Custom illustrations of alien probes/satellites for "No data yet" states (place in center of empty tables/feeds)
2. **User Avatars**: Circular with cyan border glow for active users
3. **Background Texture**: Subtle star field pattern (very low opacity 5%) on main background
4. **Logo**: Alien head icon with probe antenna (top-left sidebar, 40px)

## Icons
Use **Heroicons** (outline style) via CDN for all interface icons. Key icons needed: activity (bell), pricing (currency-dollar), email (envelope), workflow (squares-2x2), settings (cog), users, chart-bar, clock, check-circle, x-circle, plus, trash, pencil, arrow-path.

## Accessibility
- All interactive elements: min 44px touch target
- Focus indicators: 2px cyan outline with offset
- Screen reader labels for all icon buttons
- ARIA live regions for activity feed updates
- Keyboard navigation: Tab order follows visual hierarchy
- Color contrast: All text meets WCAG AA on dark backgrounds