import { NextResponse } from "next/server";

export function okResponse(data = null, message = "Operación exitosa.", status = 200) {
    return NextResponse.json(
        {
            success: true,
            ok: true,
            message,
            data,
        },
        { status }
    );
}

export function errorResponse(message = "Ocurrió un error.", status = 400, extra = {}) {
    return NextResponse.json(
        {
            success: false,
            ok: false,
            message,
            ...extra,
        },
        { status }
    );
}

export function badRequest(message = "Solicitud inválida.", extra = {}) {
    return errorResponse(message, 400, extra);
}

export function unauthorized(message = "Usuario no autenticado.") {
    return errorResponse(message, 401);
}

export function forbidden(message = "No tienes permisos para realizar esta accion.") {
    return errorResponse(message, 403);
}

export function notFound(message = "Recurso no encontrado.") {
    return errorResponse(message, 404);
}

export function serverError(error, label = "[API_ERROR]") {
    console.error(label, error);

    return errorResponse(
        "Ocurrió un error interno al procesar la solicitud.",
        500
    );
}
