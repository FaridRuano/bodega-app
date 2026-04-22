import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { dbConnect } from "@libs/mongodb";
import User from "@models/User";

export async function POST(request) {
  try {
    await dbConnect();

    const body = await request.json();
    const username = String(body?.username || "").trim().toLowerCase();
    const currentPassword = String(body?.currentPassword || "");
    const newPassword = String(body?.newPassword || "");

    if (!username) {
      return NextResponse.json(
        {
          success: false,
          message: "El usuario es obligatorio.",
        },
        { status: 400 }
      );
    }

    if (!currentPassword) {
      return NextResponse.json(
        {
          success: false,
          message: "La contraseña anterior es obligatoria.",
        },
        { status: 400 }
      );
    }

    if (newPassword.trim().length < 6) {
      return NextResponse.json(
        {
          success: false,
          message: "La nueva contraseña debe tener al menos 6 caracteres.",
        },
        { status: 400 }
      );
    }

    const user = await User.findOne({ username }).select("+password");

    if (!user || !user.isActive) {
      return NextResponse.json(
        {
          success: false,
          message: "Usuario o contraseña anterior incorrectos.",
        },
        { status: 401 }
      );
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        {
          success: false,
          message: "Usuario o contraseña anterior incorrectos.",
        },
        { status: 401 }
      );
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);

    if (isSamePassword) {
      return NextResponse.json(
        {
          success: false,
          message: "La nueva contraseña debe ser diferente a la anterior.",
        },
        { status: 409 }
      );
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return NextResponse.json(
      {
        success: true,
        message: "La contraseña se actualizó correctamente.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/auth/change-password error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "No se pudo actualizar la contraseña.",
      },
      { status: 500 }
    );
  }
}
