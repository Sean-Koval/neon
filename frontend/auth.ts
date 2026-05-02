/**
 * NextAuth v5 Configuration
 *
 * Provides authentication via GitHub OAuth (primary) with JWT session strategy.
 * Integrates with the existing multi-tenant organization/workspace model.
 *
 * On first sign-in, creates a personal organization and workspace for the user.
 */

import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import {
  accounts,
  db,
  orgMembers,
  organizations,
  users,
  verificationTokens,
  workspaceMembers,
  workspaces,
} from '@/lib/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,
  }),
  session: {
    strategy: 'jwt',
  },
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // On initial sign-in, attach user ID and set up org/workspace
      if (user?.id) {
        token.userId = user.id

        // Find or create default organization and workspace for this user
        const membership = await db.query.orgMembers.findFirst({
          where: eq(orgMembers.userId, user.id),
          with: {
            organization: {
              with: {
                workspaces: true,
              },
            },
          },
        })

        if (membership) {
          token.organizationId = membership.organizationId
          const ws = membership.organization.workspaces[0]
          if (ws) {
            token.workspaceId = ws.id
          }
        } else {
          // First sign-in: create personal org + workspace
          const orgSlug = `personal-${user.id.slice(0, 8)}`
          const [org] = await db
            .insert(organizations)
            .values({
              name: `${user.name || user.email}'s Organization`,
              slug: orgSlug,
            })
            .returning()

          const [ws] = await db
            .insert(workspaces)
            .values({
              organizationId: org.id,
              name: 'Default',
              slug: 'default',
              environment: 'development',
            })
            .returning()

          await db.insert(orgMembers).values({
            organizationId: org.id,
            userId: user.id,
            role: 'owner',
            acceptedAt: new Date(),
          })

          await db.insert(workspaceMembers).values({
            workspaceId: ws.id,
            userId: user.id,
            role: 'admin',
          })

          token.organizationId = org.id
          token.workspaceId = ws.id
        }
      }
      return token
    },
    async session({ session, token }) {
      // Expose IDs to the client session
      if (token.userId) {
        session.user.id = token.userId as string
      }
      if (token.organizationId) {
        ;(session as any).organizationId = token.organizationId
      }
      if (token.workspaceId) {
        ;(session as any).workspaceId = token.workspaceId
      }
      return session
    },
  },
})
