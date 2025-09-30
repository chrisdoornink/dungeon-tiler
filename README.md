# Torch Boy - Daily Dungeon Challenge

A roguelike dungeon crawler game built with Next.js featuring daily challenges, PostHog analytics, and a retro pixel art aesthetic.

## Features

- **Daily Challenge System**: One dungeon per day, same for all players
- **Roguelike Mechanics**: Turn-based combat, item collection, procedural dungeons
- **Analytics Integration**: PostHog for user behavior tracking
- **Mobile Responsive**: Optimized for both desktop and mobile play
- **Production Security**: Non-daily routes blocked in production

## Prerequisites

- Node.js 18+ (Note: PostHog requires Node 20+ but works with warnings on 18)
- npm or yarn
- PostHog account (for analytics)

## Environment Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd dungeon-tiler
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Copy the example environment file:
   ```bash
   cp env.example .env.local
   ```
   
   **Required for production:**
   - `NEXT_PUBLIC_POSTHOG_KEY` - Your PostHog project API key
   
   **Optional for development:**
   - Comment out PostHog variables in `.env.local` to disable analytics locally

## PostHog Analytics Setup

This project uses PostHog for user analytics and behavior tracking.

### Getting Your PostHog API Key

1. Sign up at [PostHog](https://posthog.com)
2. Create a new project
3. Go to Project Settings → API Keys
4. Copy your **Project API Key** (starts with `phc_`)

### Local Development

- **With analytics**: Add your PostHog key to `.env.local`
- **Without analytics**: Comment out or omit the PostHog key

### Production Deployment

Add the following environment variables to your hosting platform:

- `NEXT_PUBLIC_POSTHOG_KEY` - Your PostHog project API key

## Development

```bash
# Start development server
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type checking
npm run typecheck

# Linting
npm run lint

# Build for production
npm run build
```

## Game Routes

### Production Routes (torchboy.com)
- `/` - Daily challenge (only accessible route in production)

### Development/Test Routes (blocked in production)
- `/intro` - Game instructions (accessible only through the daily flow)
- `/end` - Game completion screen (requires session data)

## Architecture

- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS v3
- **Analytics**: PostHog for event tracking and user identification
- **Testing**: Jest with React Testing Library
- **Deployment**: Optimized for Vercel

## Key Dependencies

- **PostHog**: `posthog-js` and `posthog-node` for analytics
- **Tailwind CSS**: v3.4.0 (downgraded from v4 for production stability)
- **Next.js**: v15.4.4 with Turbopack for fast development

## Production Considerations

- Test routes are automatically blocked via middleware
- Only daily challenge mode is accessible to users
- PostHog analytics require environment variables to be set
- Mobile-optimized responsive design

## Contributing

1. Ensure all tests pass: `npm test`
2. Run type checking: `npm run typecheck`  
3. Follow the existing code style and patterns
4. Test on both desktop and mobile viewports
