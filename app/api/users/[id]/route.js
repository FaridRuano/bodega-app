import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireUserRole } from "@libs/apiAuth";
import dbConnect from "@libs/mongodb";
import User from "@models/User";

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function normalizeOptionalEmail(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized || undefined;
}

export async function GET(_, { params }) {
    try {
        const { response } = await requireUserRole(["admin"]);
        if (response) return response;

        await dbConnect();

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "ID de usuario inválido.",
                },
                { status: 400 }
            );
        }

        const user = await User.findById(id).select("-password").lean();

        if (!user) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Usuario no encontrado.",
                },
                { status: 404 }
            );
        }

        return NextResponse.json(
            {
                success: true,
                data: user,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/users/[id] error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "No se pudo obtener el usuario.",
            },
            { status: 500 }
        );
    }
}

export async function PATCH(request, { params }) {
    try {
        const { user: currentUser, response } = await requireUserRole(["admin"]);
        if (response) return response;

        await dbConnect();

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "ID de usuario inválido.",
                },
                { status: 400 }
            );
        }

        const body = await request.json();

        const {
            firstName,
            lastName,
            username,
            email,
            role,
            isActive,
        } = body;

        const user = await User.findById(id);

        if (!user) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Usuario no encontrado.",
                },
                { status: 404 }
            );
        }

        if (typeof firstName === "string") {
            if (!firstName.trim()) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Los nombres son obligatorios.",
                    },
                    { status: 400 }
                );
            }

            user.firstName = firstName.trim();
        }

        if (typeof lastName === "string") {
            if (!lastName.trim()) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Los apellidos son obligatorios.",
                    },
                    { status: 400 }
                );
            }

            user.lastName = lastName.trim();
        }

        if (typeof username === "string") {
            if (!username.trim()) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "El nombre de usuario es obligatorio.",
                    },
                    { status: 400 }
                );
            }

            const normalizedUsername = username.trim().toLowerCase();

            const existingUsername = await User.findOne({
                username: normalizedUsername,
                _id: { $ne: id },
            });

            if (existingUsername) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Ya existe otro usuario con ese nombre de usuario.",
                    },
                    { status: 409 }
                );
            }

            user.username = normalizedUsername;
        }

        if (typeof email === "string") {
            const normalizedEmail = normalizeOptionalEmail(email);

            if (normalizedEmail) {
                const existingEmail = await User.findOne({
                    email: normalizedEmail,
                    _id: { $ne: id },
                });

                if (existingEmail) {
                    return NextResponse.json(
                        {
                            success: false,
                            message: "Ya existe otro usuario con ese correo electrónico.",
                        },
                        { status: 409 }
                    );
                }
            }

            user.email = normalizedEmail;
        }

        if (typeof role === "string") {
            user.role = role;
        }

        if (typeof isActive === "boolean") {
            if (
                !isActive &&
                String(user._id) === String(currentUser.id) &&
                user.role === "admin"
            ) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "No puedes desactivar tu propio usuario administrador.",
                    },
                    { status: 409 }
                );
            }

            user.isActive = isActive;
        }

        if (user.role === "admin" && user.isActive === false) {
            const activeAdminCount = await User.countDocuments({
                role: "admin",
                isActive: true,
                _id: { $ne: user._id },
            });

            if (activeAdminCount === 0) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Debe existir al menos un administrador activo.",
                    },
                    { status: 409 }
                );
            }
        }

        await user.save();

        const userObject = user.toObject();
        delete userObject.password;

        return NextResponse.json(
            {
                success: true,
                message: "Usuario actualizado correctamente.",
                data: userObject,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("PATCH /api/users/[id] error:", error);

        if (error?.code === 11000) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Ya existe un usuario con esos datos únicos.",
                },
                { status: 409 }
            );
        }

        return NextResponse.json(
            {
                success: false,
                message: "No se pudo actualizar el usuario.",
            },
            { status: 500 }
        );
    }
}

export async function DELETE(_, { params }) {
    try {
        const { user: currentUser, response } = await requireUserRole(["admin"]);
        if (response) return response;

        await dbConnect();

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "ID de usuario inválido.",
                },
                { status: 400 }
            );
        }

        const user = await User.findById(id);

        if (!user) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Usuario no encontrado.",
                },
                { status: 404 }
            );
        }

        if (String(user._id) === String(currentUser.id)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "No puedes eliminar tu propio usuario.",
                },
                { status: 409 }
            );
        }

        if (user.role === "admin") {
            const otherAdminCount = await User.countDocuments({
                role: "admin",
                _id: { $ne: user._id },
                isActive: true,
            });

            if (otherAdminCount === 0) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "No puedes eliminar el ultimo administrador activo.",
                    },
                    { status: 409 }
                );
            }
        }

        await User.findByIdAndDelete(id);

        return NextResponse.json(
            {
                success: true,
                message: "Usuario eliminado correctamente.",
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("DELETE /api/users/[id] error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "No se pudo eliminar el usuario.",
            },
            { status: 500 }
        );
    }
}
