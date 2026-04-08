import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { requireUserRole } from "@libs/apiAuth";
import dbConnect from "@libs/mongodb";
import User from "@models/User";

function normalizeOptionalEmail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || undefined;
}

export async function GET() {
  try {
    const { response } = await requireUserRole(["admin"]);
    if (response) return response;

    await dbConnect();

    const users = await User.find({})
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(
      {
        success: true,
        data: users,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/users error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "No se pudieron obtener los usuarios.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { response } = await requireUserRole(["admin"]);
    if (response) return response;

    await dbConnect();

    const body = await request.json();

    const {
      firstName,
      lastName,
      username,
      email = "",
      password,
      role = "kitchen",
      isActive = true,
    } = body;

    if (!firstName?.trim()) {
      return NextResponse.json(
        {
          success: false,
          message: "Los nombres son obligatorios.",
        },
        { status: 400 }
      );
    }

    if (!lastName?.trim()) {
      return NextResponse.json(
        {
          success: false,
          message: "Los apellidos son obligatorios.",
        },
        { status: 400 }
      );
    }

    if (!username?.trim()) {
      return NextResponse.json(
        {
          success: false,
          message: "El nombre de usuario es obligatorio.",
        },
        { status: 400 }
      );
    }

    if (!password || password.trim().length < 6) {
      return NextResponse.json(
        {
          success: false,
          message: "La contraseña debe tener al menos 6 caracteres.",
        },
        { status: 400 }
      );
    }

    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = normalizeOptionalEmail(email);

    const existingUsername = await User.findOne({
      username: normalizedUsername,
    });

    if (existingUsername) {
      return NextResponse.json(
        {
          success: false,
          message: "Ya existe un usuario con ese nombre de usuario.",
        },
        { status: 409 }
      );
    }

    if (normalizedEmail) {
      const existingEmail = await User.findOne({
        email: normalizedEmail,
      });

      if (existingEmail) {
        return NextResponse.json(
          {
            success: false,
            message: "Ya existe un usuario con ese correo electrónico.",
          },
          { status: 409 }
        );
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const userData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      username: normalizedUsername,
      password: hashedPassword,
      role,
      isActive: Boolean(isActive),
    };

    userData.email = normalizedEmail;

    const user = await User.create(userData);

    const userObject = user.toObject();
    delete userObject.password;

    return NextResponse.json(
      {
        success: true,
        message: "Usuario creado correctamente.",
        data: userObject,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/users error:", error);

    if (error?.code === 11000) {
      if (error?.keyPattern?.email) {
        return NextResponse.json(
          {
            success: false,
            message: "Ya existe un usuario con ese correo electrónico.",
          },
          { status: 409 }
        );
      }

      if (error?.keyPattern?.username) {
        return NextResponse.json(
          {
            success: false,
            message: "Ya existe un usuario con ese nombre de usuario.",
          },
          { status: 409 }
        );
      }

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
        message: "No se pudo crear el usuario.",
      },
      { status: 500 }
    );
  }
}
