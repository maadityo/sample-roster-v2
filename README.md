# Kakak — Sunday Service Volunteer Roster

A mobile-first web application for managing volunteer availability and absence schedules for Sunday church service ministry.

## Features

### For Kakaks (Volunteers)
- Sign in with Google (Gmail-based auth)
- View upcoming Sunday schedules with current absence counts
- Submit absence requests with smart recommendations:
  - Personal monthly quota display (max 2/month)
  - Team coverage status for the target Sunday
  - Alternative Sundays with fewer absences suggested
  - Warning flags for limit violations
- Cancel pending absences
- View personal absence history

### For Admins
- Dashboard showing upcoming Sundays with coverage alerts
- See kakaks approaching/at absence limits
- Approve or reject absence requests
- Create and manage Sunday schedules
- Add/deactivate kakaks
- Override business rules with reason logging

## Business Rules
- Maximum **2 absences** per kakak per month
- Maximum **3 kakaks** can be absent on the same Sunday
- Smart recommendations shown before confirming absence
- Admin overrides are logged in the audit trail

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 18, Tailwind CSS |
| Auth | NextAuth.js v5, Google OAuth 2.0 |
| Database | PostgreSQL + Prisma ORM |
| Deployment | Vercel (recommended) |

## Getting Started

### 1. Prerequisites
- Node.js 18+
- PostgreSQL database (local or hosted — [Neon](https://neon.tech), [Supabase](https://supabase.com), etc.)
- Google Cloud Console project with OAuth credentials

### 2. Clone & Install
```bash
git clone <repo>
cd kakak
npm install
```

### 3. Environment Variables
```bash
cp .env.example .env.local
```

Fill in `.env.local`:
```env
DATABASE_URL="postgresql://..."
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="..."          # openssl rand -base64 32
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

### 4. Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials (Web Application)
3. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Copy client ID and secret to `.env.local`

### 5. Database Setup
```bash
npm run db:generate    # Generate Prisma client
npm run db:push        # Push schema to DB (dev)
npm run db:seed        # Seed sample data
```

### 6. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 7. Set Your Account as Admin
After first sign-in, run in Prisma Studio (`npm run db:studio`) or directly in your DB:
```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'your@gmail.com';
```

## API Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/schedules` | Any | List upcoming schedules |
| POST | `/api/schedules` | Admin | Create schedule |
| PATCH | `/api/schedules/[id]` | Admin | Update schedule |
| DELETE | `/api/schedules/[id]` | Admin | Delete schedule |
| GET | `/api/absences` | Any | List absences (scoped by role) |
| POST | `/api/absences` | Any | Submit absence |
| PATCH | `/api/absences/[id]` | Any | Update absence status |
| GET | `/api/recommendations` | Any | Get absence recommendations |
| GET | `/api/users` | Admin | List all kakaks with stats |
| POST | `/api/users` | Admin | Add/invite kakak |
| PATCH | `/api/users/[id]` | Admin | Update user |

## Deployment (Vercel)

```bash
npm i -g vercel
vercel
```

Set all environment variables in Vercel dashboard. Update `NEXTAUTH_URL` to your production URL and add the production callback URL to Google Cloud Console.

## Project Structure

```
src/
├── app/
│   ├── (auth)/login/        # Sign-in page
│   ├── (kakak)/             # Kakak-facing pages
│   │   ├── dashboard/       # Schedule view
│   │   └── absence/         # Absence history
│   ├── (admin)/             # Admin pages
│   │   ├── dashboard/       # Overview & alerts
│   │   ├── schedules/       # Schedule management
│   │   └── kakaks/          # Volunteer management
│   └── api/                 # API routes
├── components/
│   ├── ui/                  # Shared UI components
│   ├── kakak/               # Kakak-specific components
│   └── admin/               # Admin-specific components
├── lib/
│   ├── auth.ts              # NextAuth configuration
│   ├── prisma.ts            # Prisma client
│   ├── recommendations.ts   # Smart absence recommendations
│   ├── constants.ts         # Business rule constants
│   └── utils.ts             # Utility functions
└── types/                   # TypeScript types
prisma/
├── schema.prisma            # Database schema
└── seed.ts                  # Sample data seeder
```
