import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { dbConnect } from "@libs/mongodb";
import User from "@models/User";

export const { handlers, auth, signIn, signOut } = NextAuth({
    session: {
        strategy: "jwt",
    },
    providers: [
        Credentials({
            name: "Credenciales",
            credentials: {
                username: { label: "Usuario", type: "text" },
                password: { label: "Contraseña", type: "password" },
            },
            async authorize(credentials) {
                await dbConnect();

                const username = credentials?.username?.trim()?.toLowerCase();
                const password = credentials?.password;

                if (!username || !password) return null;

                const user = await User.findOne({ username }).select("+password");
                if (!user || !user.isActive) return null;

                const isValidPassword = await bcrypt.compare(password, user.password);
                if (!isValidPassword) return null;

                await User.findByIdAndUpdate(user._id, {
                    lastLoginAt: new Date(),
                });

                return {
                    id: user._id.toString(),
                    name: `${user.firstName} ${user.lastName}`,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    username: user.username,
                    role: user.role,
                };
            },
        }),
    ],
    pages: {
        signIn: "/login",
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.username = user.username;
                token.role = user.role;
                token.firstName = user.firstName;
                token.lastName = user.lastName;
                token.name = user.name;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id;
                session.user.username = token.username;
                session.user.role = token.role;
                session.user.firstName = token.firstName;
                session.user.lastName = token.lastName;
                session.user.name = token.name;
            }
            return session;
        },
    },
    secret: process.env.AUTH_SECRET,
});