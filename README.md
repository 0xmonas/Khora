# Character Generator

An AI-powered character generator that creates unique characters with personalities, backstories, and visual representations.

## Features

- Character generation using Claude AI
- Image generation using Replicate API
- SVG representation of character data
- Social media client integration
- Authentication system
- Character gallery
- Dark/Light theme support

## Tech Stack

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- shadcn/ui
- Claude AI
- Replicate API

## Getting Started

1. Clone the repository
2. Install dependencies
   ```bash
   npm install
   ```
3. Create a `.env` file with your API keys
   ```
   ANTHROPIC_API_KEY=your_api_key
   REPLICATE_API_TOKEN=your_api_token
   ```
4. Run the development server
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
src/
├── app/                # Next.js app router pages
├── components/         # React components
│   ├── common/        # Reusable components
│   ├── features/      # Feature-specific components
│   ├── layouts/       # Layout components
│   └── ui/            # UI components (shadcn)
├── context/           # React context
├── hooks/             # Custom React hooks
├── lib/              # Third-party library configs
├── services/         # API and service layer
├── styles/           # Global styles and themes
├── types/            # TypeScript types
└── utils/            # Utilities and helpers
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a pull request