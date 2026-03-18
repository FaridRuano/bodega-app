
import { NextResponse } from "next/server";
import { connectToDatabase } from "@libs/mongodb";

export async function GET() {
  try {
    await connectToDatabase();

    return NextResponse.json({
      success: true,
      message: "Conexión a MongoDB exitosa",
    });
  } catch (error) {
    console.error("MongoDB connection error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al conectar con MongoDB",
        error: error.message,
      },
      { status: 500 }
    );
  }
}