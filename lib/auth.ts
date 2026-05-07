import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // After Google sign-in, create/update user in Supabase
      if (account?.provider === "google" && user) {
        const { createServerClient } = await import("@/lib/supabase/server");
        const supabase = createServerClient();

        // Upsert user into our users table
        const { error } = await supabase.from("users").upsert(
          {
            id: user.id!,
            email: user.email!,
            name: user.name,
            avatar_url: user.image,
          },
          { onConflict: "id" }
        );

        if (error) {
          console.error("Error upserting user:", error);
        }
      }
      return true;
    },
    async session({ session, token }) {
      // Add user ID to session
      if (token?.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
