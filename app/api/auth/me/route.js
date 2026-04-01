import { auth } from "@auth";
import { NextResponse } from "next/server";

export async function GET() {
    const session = await auth();

    if (!session?.user) {
        return NextResponse.json(
            {
                success: false,
                message: "No autenticado",
            },
            { status: 401 }
        );
    }

    return NextResponse.json({
        success: true,
        user: session.user,
    });
}