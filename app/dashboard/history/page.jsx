"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  Factory,
  PackageSearch,
  Search,
  ShoppingBag,
  Truck,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import styles from "./page.module.scss";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";
import { buildSearchParams, getPositiveIntParam, getStringParam } from "@libs/urlParams";
import {
  getLocationLabel,
  getMovementTypeLabel,
  getReferenceTypeLabel,
  getRequestStatusLabel,
} from "@libs/constants/domainLabels";
import { PRODUCTION_STATUS_LABELS } from "@libs/constants/productionStatus";
import { getPurposeLabel } from "@libs/constants/purposes";
import { getUnitLabel } from "@libs/constants/units";

const PAGE_SIZE = 12;
const REQUEST_ACTIVITY_LIMIT = 5;
const PURCHASE_ACTIVITY_LIMIT = 5;

const HISTORY_FILTERS = [
  { value: "all", label: "Todo" },
  { value: "request", label: "Solicitudes" },
  { value: "purchase", label: "Compras" },
  { value: "production", label: "Producción" },
  { value: "movement", label: "Movimientos" },
  { value: "daily_control", label: "Control diario" },
];

const PURCHASE_REQUEST_STATUS_LABELS = {
  pending: "Pendiente",
  approved: "Aprobada",
  in_progress: "En proceso",
  partially_purchased: "Parcialmente atendida",
  completed: "Completada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

const PURCHASE_BATCH_STATUS_LABELS = {
  draft: "Borrador",
  purchased: "Compra realizada",
  dispatched: "Despachada",
  completed: "Completada",
  cancelled: "Cancelada",
};

function formatDate(value) {
  if (!value) return "Sin fecha";

  try {
    return new Intl.DateTimeFormat("es-EC", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "Sin fecha";
  }
}

function buildPersonLabel(user) {
  if (!user) return "Sin responsable";

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || user.username || user.email || "Sin responsable";
}

function getPurchaseRequestStatusLabel(status) {
  return PURCHASE_REQUEST_STATUS_LABELS[status] || status || "Pendiente";
}

function getPurchaseBatchStatusLabel(status) {
  return PURCHASE_BATCH_STATUS_LABELS[status] || status || "Compra";
}

function getRequestActionLabel(activity, request) {
  if (activity?.title) return activity.title;

  switch (activity?.type) {
    case "request_created":
      return "Solicitud creada";
    case "approved":
      return "Solicitud en proceso";
    case "dispatch":
      return request?.requestType === "return"
        ? "Transferencia despachada"
        : "Despacho registrado";
    case "receive":
      return request?.requestType === "return"
        ? "Transferencia recibida"
        : "Recepción registrada";
    case "rejected":
      return "Solicitud rechazada";
    case "cancelled":
      return "Solicitud cancelada";
    case "edited":
      return "Solicitud editada";
    default:
      return "Movimiento registrado";
  }
}

function getPurchaseRequestActionLabel(activity) {
  if (activity?.title) return activity.title;

  switch (activity?.type) {
    case "request_created":
      return "Solicitud de compra creada";
    case "request_updated":
      return "Solicitud actualizada";
    case "request_approved":
      return "Solicitud aprobada";
    case "request_rejected":
      return "Solicitud rechazada";
    case "request_cancelled":
      return "Solicitud cancelada";
    case "purchase_registered":
      return "Compra vinculada";
    default:
      return "Actualización";
  }
}

function getPurchaseBatchActionLabel(activity) {
  if (activity?.title) return activity.title;

  switch (activity?.type) {
    case "purchase_saved_draft":
      return "Borrador guardado";
    case "purchase_updated_draft":
      return "Borrador actualizado";
    case "purchase_created":
      return "Compra registrada";
    case "purchase_dispatched":
      return "Compra despachada";
    case "receipt_confirmed":
      return "Recepción confirmada";
    default:
      return "Actualización";
  }
}

function getProductionActionLabel(production) {
  switch (production?.status) {
    case "completed":
      return "Producción completada";
    case "cancelled":
      return "Producción cancelada";
    case "in_progress":
      return "Producción iniciada";
    case "draft":
    default:
      return "Producción creada";
  }
}

function buildRequestPreview(request) {
  const names = (request.items || []).map((item) => item.product?.name).filter(Boolean);

  if (names.length === 0) return "Sin productos registrados.";
  if (names.length <= 2) return names.join(" · ");

  return `${names.slice(0, 2).join(" · ")} +${names.length - 2} más`;
}

function buildPurchaseRequestPreview(request) {
  const names = (request.items || []).map((item) => item.product?.name).filter(Boolean);

  if (names.length === 0) return "Sin productos registrados.";
  if (names.length <= 2) return names.join(" · ");

  return `${names.slice(0, 2).join(" · ")} +${names.length - 2} más`;
}

function buildPurchaseBatchPreview(batch) {
  const items = batch.items || [];
  const names = items.map((item) => item.product?.name).filter(Boolean);

  if (names.length === 0) return "Sin productos cargados.";
  if (names.length <= 2) return names.join(" · ");

  return `${names.slice(0, 2).join(" · ")} +${names.length - 2} más`;
}

function buildProductionPreview(production) {
  const outputs = [
    ...(production.outputs || []),
    ...(production.byproducts || []),
    ...(production.waste || []),
  ];

  const names = (outputs.length ? outputs : production.expectedOutputs || [])
    .map((item) => item.productNameSnapshot)
    .filter(Boolean);

  if (names.length === 0) return "Sin resultados registrados.";
  if (names.length <= 2) return names.join(" · ");

  return `${names.slice(0, 2).join(" · ")} +${names.length - 2} más`;
}

function buildMovementPreview(movement) {
  const parts = [
    movement.productId?.name || "Producto",
    `${movement.quantity} ${getUnitLabel(movement.unitSnapshot)}`,
  ];

  if (movement.notes) {
    parts.push(movement.notes);
  }

  return parts.filter(Boolean).join(" · ");
}

function buildDailyControlPreview(control) {
  const lines = (control.lines || []).slice(0, 3).map((line) => {
    return `${line.productNameSnapshot}: ${line.issuedQuantity}`;
  });

  if (!lines.length) return "Sin productos registrados.";

  return lines.length < (control.lines || []).length
    ? `${lines.join(" · ")} +${control.lines.length - lines.length} más`
    : lines.join(" · ");
}

function getHistoryKindMeta(kind) {
  switch (kind) {
    case "request":
      return {
        label: "Solicitud",
        icon: ShoppingBag,
        badgeClass: styles.kindRequest,
      };
    case "purchase":
      return {
        label: "Compra",
        icon: PackageSearch,
        badgeClass: styles.kindPurchase,
      };
    case "production":
      return {
        label: "Producción",
        icon: Factory,
        badgeClass: styles.kindProduction,
      };
    case "movement":
      return {
        label: "Movimiento",
        icon: Truck,
        badgeClass: styles.kindMovement,
      };
    case "daily_control":
      return {
        label: "Cierre diario",
        icon: ClipboardCheck,
        badgeClass: styles.kindDailyControl,
      };
    default:
      return {
        label: "Historial",
        icon: CalendarDays,
        badgeClass: styles.kindGeneric,
      };
  }
}

function buildRequestHistoryItems(requests = []) {
  return requests.flatMap((request) => {
    const activities = [...(request.activityLog || [])]
      .sort((a, b) => new Date(b?.performedAt || 0).getTime() - new Date(a?.performedAt || 0).getTime())
      .slice(0, REQUEST_ACTIVITY_LIMIT);

    const source = getLocationLabel(request.sourceLocation, "Bodega");
    const destination = getLocationLabel(request.destinationLocation, "Cocina");

    if (!activities.length) {
      return [{
        id: request._id,
        kind: "request",
        code: request.requestNumber || "Solicitud sin número",
        title: getPurposeLabel(request.justification) || request.justification || "Solicitud interna",
        statusLabel: getRequestStatusLabel(request.status),
        date: request.requestedAt || request.createdAt,
        actionLabel: "Solicitud creada",
        actorLabel: buildPersonLabel(request.requestedBy),
        route: { from: source, to: destination },
        preview: buildRequestPreview(request),
        note: request.notes || request.statusReason || "",
        href: `/dashboard/requests?search=${encodeURIComponent(request.requestNumber || "")}`,
        searchText: [
          request.requestNumber,
          request.justification,
          request.notes,
          request.statusReason,
          request.requestedBy?.username,
          request.requestedBy?.email,
          ...(request.items || []).flatMap((item) => [item.product?.name, item.product?.code]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        actorIds: [
          request.requestedBy?._id,
          request.requestedBy?.id,
        ].filter(Boolean).map(String),
      }];
    }

    return activities.map((activity) => ({
      id: `${request._id}-${activity._id || activity.performedAt || activity.type}`,
      kind: "request",
      code: request.requestNumber || "Solicitud sin número",
      title: getPurposeLabel(request.justification) || request.justification || "Solicitud interna",
      statusLabel: getRequestStatusLabel(request.status),
      date: activity?.performedAt || request.requestedAt || request.createdAt,
      actionLabel: getRequestActionLabel(activity, request),
      actorLabel: buildPersonLabel(activity?.performedBy || request.requestedBy),
      route: { from: source, to: destination },
      preview: buildRequestPreview(request),
      note: activity?.description || request.notes || request.statusReason || "",
      href: `/dashboard/requests?search=${encodeURIComponent(request.requestNumber || "")}`,
      searchText: [
        request.requestNumber,
        request.justification,
        request.notes,
        request.statusReason,
        activity?.title,
        activity?.description,
        activity?.performedBy?.username,
        activity?.performedBy?.email,
        request.requestedBy?.username,
        request.requestedBy?.email,
        ...(request.items || []).flatMap((item) => [item.product?.name, item.product?.code]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      actorIds: [
        activity?.performedBy?._id,
        activity?.performedBy?.id,
        request.requestedBy?._id,
        request.requestedBy?.id,
      ].filter(Boolean).map(String),
    }));
  });
}

function buildPurchaseRequestHistoryItems(requests = []) {
  return requests.flatMap((request) => {
    const activities = [...(request.activityLog || [])]
      .sort((a, b) => new Date(b?.performedAt || 0).getTime() - new Date(a?.performedAt || 0).getTime())
      .slice(0, PURCHASE_ACTIVITY_LIMIT);

    const destination = getLocationLabel(request.destinationLocation, "Bodega");

    if (!activities.length) {
      return [{
        id: request._id,
        kind: "purchase",
        code: request.requestNumber || "Solicitud sin número",
        title: "Solicitud de compra",
        statusLabel: getPurchaseRequestStatusLabel(request.status),
        date: request.requestedAt || request.createdAt,
        actionLabel: "Solicitud creada",
        actorLabel: buildPersonLabel(request.requestedBy),
        route: { from: "Compra", to: destination },
        preview: buildPurchaseRequestPreview(request),
        note: request.requesterNote || request.statusReason || "",
        href: `/dashboard/purchases?tab=requests&search=${encodeURIComponent(request.requestNumber || "")}`,
        searchText: [
          request.requestNumber,
          request.requesterNote,
          request.statusReason,
          request.requestedBy?.username,
          request.requestedBy?.email,
          ...(request.items || []).flatMap((item) => [item.product?.name, item.product?.code]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        actorIds: [request.requestedBy?._id, request.requestedBy?.id].filter(Boolean).map(String),
      }];
    }

    return activities.map((activity) => ({
      id: `${request._id}-${activity._id || activity.performedAt || activity.type}`,
      kind: "purchase",
      code: request.requestNumber || "Solicitud sin número",
      title: "Solicitud de compra",
      statusLabel: getPurchaseRequestStatusLabel(request.status),
      date: activity?.performedAt || request.requestedAt || request.createdAt,
      actionLabel: getPurchaseRequestActionLabel(activity),
      actorLabel: buildPersonLabel(activity?.performedBy || request.requestedBy),
      route: { from: "Compra", to: destination },
      preview: buildPurchaseRequestPreview(request),
      note: activity?.description || request.requesterNote || request.statusReason || "",
      href: `/dashboard/purchases?tab=requests&search=${encodeURIComponent(request.requestNumber || "")}`,
      searchText: [
        request.requestNumber,
        request.requesterNote,
        request.statusReason,
        activity?.title,
        activity?.description,
        activity?.performedBy?.username,
        activity?.performedBy?.email,
        ...(request.items || []).flatMap((item) => [item.product?.name, item.product?.code]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      actorIds: [
        activity?.performedBy?._id,
        activity?.performedBy?.id,
        request.requestedBy?._id,
        request.requestedBy?.id,
      ].filter(Boolean).map(String),
    }));
  });
}

function buildPurchaseBatchHistoryItems(batches = []) {
  return batches.flatMap((batch) => {
    const activities = [...(batch.activityLog || [])]
      .sort((a, b) => new Date(b?.performedAt || 0).getTime() - new Date(a?.performedAt || 0).getTime())
      .slice(0, PURCHASE_ACTIVITY_LIMIT);

    const destination = getLocationLabel(
      batch.primaryDestinationLocation || batch.destinationLocation,
      "Bodega"
    );

    if (!activities.length) {
      return [{
        id: batch._id,
        kind: "purchase",
        code: batch.batchNumber || "Compra sin número",
        title: "Compra registrada",
        statusLabel: getPurchaseBatchStatusLabel(batch.status),
        date: batch.purchasedAt || batch.createdAt,
        actionLabel: "Compra creada",
        actorLabel: buildPersonLabel(batch.registeredBy),
        route: { from: "Proveedor", to: destination },
        preview: buildPurchaseBatchPreview(batch),
        note: batch.note || "",
        href: `/dashboard/purchases/history?search=${encodeURIComponent(batch.batchNumber || "")}`,
        searchText: [
          batch.batchNumber,
          batch.supplierName,
          batch.note,
          ...(batch.items || []).flatMap((item) => [item.product?.name, item.product?.code]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        actorIds: [batch.registeredBy?._id, batch.registeredBy?.id].filter(Boolean).map(String),
      }];
    }

    return activities.map((activity) => ({
      id: `${batch._id}-${activity._id || activity.performedAt || activity.type}`,
      kind: "purchase",
      code: batch.batchNumber || "Compra sin número",
      title: batch.supplierName || "Compra registrada",
      statusLabel: getPurchaseBatchStatusLabel(batch.status),
      date: activity?.performedAt || batch.purchasedAt || batch.createdAt,
      actionLabel: getPurchaseBatchActionLabel(activity),
      actorLabel: buildPersonLabel(activity?.performedBy || batch.registeredBy),
      route: {
        from: batch.supplierName || "Proveedor",
        to: destination,
      },
      preview: buildPurchaseBatchPreview(batch),
      note: activity?.description || batch.note || "",
      href: `/dashboard/purchases/history?search=${encodeURIComponent(batch.batchNumber || "")}`,
      searchText: [
        batch.batchNumber,
        batch.supplierName,
        batch.note,
        activity?.title,
        activity?.description,
        ...(batch.items || []).flatMap((item) => [item.product?.name, item.product?.code]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      actorIds: [
        activity?.performedBy?._id,
        activity?.performedBy?.id,
        batch.registeredBy?._id,
        batch.registeredBy?.id,
        batch.dispatchedBy?._id,
        batch.dispatchedBy?.id,
      ].filter(Boolean).map(String),
    }));
  });
}

function buildProductionHistoryItems(productions = []) {
  return (productions || []).map((production) => ({
    id: production._id,
    kind: "production",
    code: production.productionNumber || "Producción sin número",
    title: production.templateSnapshot?.name || "Producción sin plantilla",
    statusLabel: PRODUCTION_STATUS_LABELS[production.status] || production.status,
    date: production.completedAt || production.startedAt || production.createdAt,
    actionLabel: getProductionActionLabel(production),
    actorLabel: buildPersonLabel(production.performedBy),
    route: {
      from: getLocationLabel(production.location, "Cocina"),
      to: "Producción",
    },
    preview: buildProductionPreview(production),
    note: production.notes || "",
    href: `/dashboard/production/${production._id}`,
    searchText: [
      production.productionNumber,
      production.templateSnapshot?.name,
      production.templateSnapshot?.code,
      production.notes,
      production.performedBy?.username,
      production.performedBy?.firstName,
      production.performedBy?.lastName,
      ...(production.expectedInputs || []).flatMap((item) => [item.productNameSnapshot, item.productCodeSnapshot]),
      ...(production.expectedOutputs || []).flatMap((item) => [item.productNameSnapshot, item.productCodeSnapshot]),
      ...(production.outputs || []).flatMap((item) => [item.productNameSnapshot, item.productCodeSnapshot]),
      ...(production.byproducts || []).flatMap((item) => [item.productNameSnapshot, item.productCodeSnapshot]),
      ...(production.waste || []).flatMap((item) => [item.productNameSnapshot, item.productCodeSnapshot]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    actorIds: [production.performedBy?._id, production.performedBy?.id].filter(Boolean).map(String),
  }));
}

function buildMovementHistoryItems(movements = []) {
  return (movements || []).map((movement) => ({
    id: movement._id,
    kind: "movement",
    code: movement.productId?.code || movement.productId?.name || "Movimiento",
    title: getMovementTypeLabel(movement.movementType),
    statusLabel: getReferenceTypeLabel(movement.referenceType),
    date: movement.movementDate || movement.createdAt,
    actionLabel: movement.movementTypeLabel || getMovementTypeLabel(movement.movementType),
    actorLabel: movement.performedByLabel || buildPersonLabel(movement.performedBy),
    route: {
      from: movement.fromLocationLabel || getLocationLabel(movement.fromLocation, "Origen"),
      to: movement.toLocationLabel || getLocationLabel(movement.toLocation, "Destino"),
    },
    preview: buildMovementPreview(movement),
    note: movement.notes || "",
    href: `/dashboard/movements?search=${encodeURIComponent(movement.productId?.name || movement.productId?.code || "")}`,
    searchText: [
      movement.productId?.name,
      movement.productId?.code,
      movement.notes,
      movement.movementTypeLabel,
      movement.referenceTypeLabel,
      movement.performedByLabel,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    actorIds: [movement.performedBy?._id, movement.performedBy?.id].filter(Boolean).map(String),
  }));
}

function buildDailyControlHistoryItems(controls = []) {
  return (controls || []).map((control) => ({
    id: control._id,
    kind: "daily_control",
    code: control.controlNumber || "Cierre diario",
    title: "Cierre diario registrado",
    statusLabel: control.locationLabel || getLocationLabel(control.location),
    date: control.controlDate || control.createdAt,
    actionLabel: "Cierre del turno",
    actorLabel: buildPersonLabel(control.registeredBy),
    route: {
      from: getLocationLabel(control.location, "Ubicación"),
      to: "Control diario",
    },
    preview: buildDailyControlPreview(control),
    note: control.notes || "",
    href: `/dashboard/daily-control`,
    searchText: [
      control.controlNumber,
      control.locationLabel,
      control.notes,
      ...(control.lines || []).flatMap((line) => [line.productNameSnapshot, line.productCodeSnapshot]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    actorIds: [control.registeredBy?._id, control.registeredBy?.id].filter(Boolean).map(String),
  }));
}

function buildUnifiedHistory({
  requests,
  purchaseRequests,
  purchaseBatches,
  productions,
  movements,
  dailyControls,
}) {
  return [
    ...buildRequestHistoryItems(requests),
    ...buildPurchaseRequestHistoryItems(purchaseRequests),
    ...buildPurchaseBatchHistoryItems(purchaseBatches),
    ...buildProductionHistoryItems(productions),
    ...buildMovementHistoryItems(movements),
    ...buildDailyControlHistoryItems(dailyControls),
  ].sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });
}

export default function HistoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [currentUser, setCurrentUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [purchaseRequests, setPurchaseRequests] = useState([]);
  const [purchaseBatches, setPurchaseBatches] = useState([]);
  const [productions, setProductions] = useState([]);
  const [movements, setMovements] = useState([]);
  const [dailyControls, setDailyControls] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState(() => getStringParam(searchParams, "search"));
  const [typeFilter, setTypeFilter] = useState(() => getStringParam(searchParams, "type", "all"));
  const [dateFrom, setDateFrom] = useState(() => getStringParam(searchParams, "dateFrom"));
  const [dateTo, setDateTo] = useState(() => getStringParam(searchParams, "dateTo"));
  const [userFilter, setUserFilter] = useState(() => getStringParam(searchParams, "userId"));
  const [page, setPage] = useState(() => getPositiveIntParam(searchParams, "page", 1));

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, dateFrom, dateTo, userFilter]);

  useEffect(() => {
    const nextQuery = buildSearchParams(searchParams, {
      search: search.trim() || null,
      type: typeFilter !== "all" ? typeFilter : null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      userId: userFilter || null,
      page: page > 1 ? page : null,
    });

    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [dateFrom, dateTo, page, pathname, router, search, searchParams, typeFilter, userFilter]);

  useEffect(() => {
    let ignore = false;

    async function loadHistory() {
      try {
        setIsLoading(true);

        const meResponse = await fetch("/api/auth/me", { cache: "no-store" });
        const meResult = await meResponse.json();

        if (!meResponse.ok || !meResult?.user) {
          throw new Error(meResult?.message || "No se pudo cargar la sesión actual.");
        }

        const user = meResult.user;
        const isAdmin = user.role === "admin";

        const requestsParams = new URLSearchParams({ limit: "160" });
        const purchaseRequestsParams = new URLSearchParams({ limit: "160" });
        const productionsParams = new URLSearchParams({ limit: "160" });
        const movementsParams = new URLSearchParams({ limit: "180" });
        const dailyControlsParams = new URLSearchParams({ limit: "120" });
        const purchaseBatchesParams = new URLSearchParams({ limit: "120" });

        if (dateFrom) {
          requestsParams.set("dateFrom", dateFrom);
          purchaseRequestsParams.set("dateFrom", dateFrom);
          productionsParams.set("dateFrom", dateFrom);
          movementsParams.set("dateFrom", dateFrom);
          dailyControlsParams.set("dateFrom", dateFrom);
          purchaseBatchesParams.set("dateFrom", dateFrom);
        }

        if (dateTo) {
          requestsParams.set("dateTo", dateTo);
          purchaseRequestsParams.set("dateTo", dateTo);
          productionsParams.set("dateTo", dateTo);
          movementsParams.set("dateTo", dateTo);
          dailyControlsParams.set("dateTo", dateTo);
          purchaseBatchesParams.set("dateTo", dateTo);
        }

        if (!isAdmin) {
          purchaseRequestsParams.set("mine", "true");
          productionsParams.set("performedBy", String(user.id || user._id || ""));

          if (user.role === "kitchen") {
            movementsParams.set("location", "kitchen");
          }

          if (user.role === "lounge") {
            movementsParams.set("location", "lounge");
          }
        }

        const tasks = [
          fetch(`/api/requests?${requestsParams.toString()}`, { cache: "no-store" }),
          fetch(`/api/purchase-requests?${purchaseRequestsParams.toString()}`, { cache: "no-store" }),
          fetch(`/api/productions?${productionsParams.toString()}`, { cache: "no-store" }),
          fetch(`/api/inventory/movements?${movementsParams.toString()}`, { cache: "no-store" }),
          fetch(`/api/inventory/daily-controls?${dailyControlsParams.toString()}`, { cache: "no-store" }),
        ];

        if (isAdmin) {
          tasks.push(
            fetch(`/api/purchase-batches?${purchaseBatchesParams.toString()}`, { cache: "no-store" }),
            fetch("/api/users", { cache: "no-store" })
          );
        }

        const responses = await Promise.all(tasks);
        const results = await Promise.all(responses.map((response) => response.json()));

        const [
          requestsResponse,
          purchaseRequestsResponse,
          productionsResponse,
          movementsResponse,
          dailyControlsResponse,
          purchaseBatchesResponse,
          usersResponse,
        ] = responses;

        const [
          requestsResult,
          purchaseRequestsResult,
          productionsResult,
          movementsResult,
          dailyControlsResult,
          purchaseBatchesResult,
          usersResult,
        ] = results;

        if (!requestsResponse.ok || !requestsResult?.success) {
          throw new Error(requestsResult?.message || "No se pudieron cargar las solicitudes.");
        }

        if (!purchaseRequestsResponse.ok || !purchaseRequestsResult?.success) {
          throw new Error(purchaseRequestsResult?.message || "No se pudieron cargar las compras.");
        }

        if (!productionsResponse.ok || !productionsResult?.success) {
          throw new Error(productionsResult?.message || "No se pudieron cargar las producciones.");
        }

        if (!movementsResponse.ok || !movementsResult?.success) {
          throw new Error(movementsResult?.message || "No se pudieron cargar los movimientos.");
        }

        if (!dailyControlsResponse.ok || !dailyControlsResult?.success) {
          throw new Error(dailyControlsResult?.message || "No se pudo cargar el control diario.");
        }

        if (isAdmin && (!purchaseBatchesResponse?.ok || !purchaseBatchesResult?.success)) {
          throw new Error(purchaseBatchesResult?.message || "No se pudieron cargar las compras registradas.");
        }

        if (isAdmin && (!usersResponse?.ok || !usersResult?.success)) {
          throw new Error(usersResult?.message || "No se pudieron cargar los usuarios.");
        }

        if (!ignore) {
          setCurrentUser(user);
          setRequests(Array.isArray(requestsResult?.data) ? requestsResult.data : []);
          setPurchaseRequests(Array.isArray(purchaseRequestsResult?.data) ? purchaseRequestsResult.data : []);
          setProductions(Array.isArray(productionsResult?.data?.items) ? productionsResult.data.items : []);
          setMovements(Array.isArray(movementsResult?.data) ? movementsResult.data : []);
          setDailyControls(Array.isArray(dailyControlsResult?.data) ? dailyControlsResult.data : []);
          setPurchaseBatches(isAdmin && Array.isArray(purchaseBatchesResult?.data) ? purchaseBatchesResult.data : []);
          setUsers(isAdmin && Array.isArray(usersResult?.data) ? usersResult.data : []);
        }
      } catch (error) {
        console.error("[HISTORY_PAGE_LOAD_ERROR]", error);

        if (!ignore) {
          setCurrentUser(null);
          setRequests([]);
          setPurchaseRequests([]);
          setPurchaseBatches([]);
          setProductions([]);
          setMovements([]);
          setDailyControls([]);
          setUsers([]);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      ignore = true;
    };
  }, [dateFrom, dateTo]);

  const historyItems = useMemo(
    () =>
      buildUnifiedHistory({
        requests,
        purchaseRequests,
        purchaseBatches,
        productions,
        movements,
        dailyControls,
      }),
    [dailyControls, movements, productions, purchaseBatches, purchaseRequests, requests]
  );

  const scopedHistoryItems = useMemo(() => {
    const currentUserId = String(currentUser?.id || currentUser?._id || "");
    const isAdmin = currentUser?.role === "admin";

    if (!currentUserId || isAdmin) {
      return historyItems;
    }

    return historyItems.filter((item) => item.actorIds?.includes(currentUserId));
  }, [currentUser, historyItems]);

  const filteredHistory = useMemo(() => {
    const query = search.trim().toLowerCase();
    const normalizedUserFilter = String(userFilter || "").trim();

    return scopedHistoryItems.filter((item) => {
      const matchesType = typeFilter === "all" || item.kind === typeFilter;
      const matchesSearch =
        !query ||
        item.searchText.includes(query) ||
        item.code.toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query);
      const matchesUser =
        !normalizedUserFilter || item.actorIds?.includes(normalizedUserFilter);

      return matchesType && matchesSearch && matchesUser;
    });
  }, [scopedHistoryItems, search, typeFilter, userFilter]);

  const paginatedHistory = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredHistory.slice(start, start + PAGE_SIZE);
  }, [filteredHistory, page]);

  const totalPages = Math.max(Math.ceil(filteredHistory.length / PAGE_SIZE), 1);
  const fromItem = filteredHistory.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toItem = filteredHistory.length === 0 ? 0 : Math.min(page * PAGE_SIZE, filteredHistory.length);

  const summary = useMemo(
    () => ({
      total: scopedHistoryItems.length,
      purchases: scopedHistoryItems.filter((item) => item.kind === "purchase").length,
      movements: scopedHistoryItems.filter((item) => item.kind === "movement").length,
      dailyControls: scopedHistoryItems.filter((item) => item.kind === "daily_control").length,
    }),
    [scopedHistoryItems]
  );

  function clearFilters() {
    setSearch("");
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
    setUserFilter("");
  }

  return (
    <div className="page">
      <section className={`hero fadeScaleIn ${styles.heroShell}`}>
        <div className="heroCopy">
          <span className="eyebrow">Auditoría</span>
          <h1 className="title">Historial</h1>
          <p className="description">
            Revisa la actividad operativa por usuario, fecha y módulo: solicitudes, compras, producción,
            movimientos y cierre diario.
          </p>
        </div>

        <div className={styles.heroStats}>
          <span className="compactStat">
            <span>
              Registros <strong>{summary.total}</strong>
            </span>
          </span>
          <span className="compactStat heroStatInfo">
            <span>
              Compras <strong>{summary.purchases}</strong>
            </span>
          </span>
          <span className="compactStat heroStatSuccess">
            <span>
              Movimientos <strong>{summary.movements}</strong>
            </span>
          </span>
          <span className="compactStat heroStatWarning">
            <span>
              Cierres <strong>{summary.dailyControls}</strong>
            </span>
          </span>
        </div>
      </section>

      <section className={`${styles.filtersCard} fadeSlideIn delayOne`}>
        <div className={styles.filtersTop}>
          <div className={`searchField ${styles.searchBox}`}>
            <Search size={16} />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por número, producto, nota o usuario"
              className="searchInput"
            />
            {search ? (
              <button
                type="button"
                className={styles.clearButton}
                onClick={() => setSearch("")}
                aria-label="Limpiar búsqueda"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            className="miniAction"
            onClick={clearFilters}
            disabled={!search.trim() && typeFilter === "all" && !dateFrom && !dateTo && !userFilter}
          >
            Limpiar filtros
          </button>
        </div>

        <div className={styles.filtersGrid}>
          <div className="form-field">
            <label className="form-label">Tipo</label>
            <div className="selectWrap">
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                className="form-input"
              >
                {HISTORY_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-field">
            <label className="form-label">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-field">
            <label className="form-label">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="form-input"
            />
          </div>

          {currentUser?.role === "admin" ? (
            <div className="form-field">
              <label className="form-label">Usuario</label>
              <div className="selectWrap">
                <select
                  value={userFilter}
                  onChange={(event) => setUserFilter(event.target.value)}
                  className="form-input"
                >
                  <option value="">Todos los usuarios</option>
                  {users.map((user) => (
                    <option key={user._id} value={user._id}>
                      {buildPersonLabel(user)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {isLoading ? (
        <div className={`${styles.emptyState} fadeScaleIn`}>Cargando historial...</div>
      ) : paginatedHistory.length === 0 ? (
        <div className={`${styles.emptyState} fadeScaleIn`}>
          <p className={styles.emptyTitle}>No encontramos resultados</p>
          <p className={styles.emptyDescription}>
            Ajusta los filtros o limpia la búsqueda para volver a ver toda la actividad.
          </p>
        </div>
      ) : (
        <>
          <div className={`${styles.resultsList} fadeSlideIn delayTwo`}>
            {paginatedHistory.map((item, index) => {
              const kindMeta = getHistoryKindMeta(item.kind);
              const Icon = kindMeta.icon;

              return (
                <article
                  key={`${item.kind}-${item.id}`}
                  className={`${styles.resultCard} fadeScaleIn`}
                  style={{ animationDelay: `${Math.min(index, 8) * 0.03}s` }}
                >
                  <div className={styles.cardHeader}>
                    <div className={styles.titleBlock}>
                      <span className={`${styles.kindBadge} ${kindMeta.badgeClass}`}>
                        <Icon size={14} />
                        {kindMeta.label}
                      </span>

                      <div>
                        <h2 className={styles.resultCode}>{item.code}</h2>
                        <p className={styles.resultTitle}>{item.title}</p>
                      </div>
                    </div>

                    <div className={styles.headerMeta}>
                      <span className={styles.statusPill}>{item.statusLabel}</span>
                      <span className={styles.datePill}>
                        <CalendarDays size={14} />
                        {formatDate(item.date)}
                      </span>
                    </div>
                  </div>

                  <div className={styles.detailsGrid}>
                    <div className={styles.detailBlock}>
                      <span className={styles.detailLabel}>Acción</span>
                      <strong className={styles.detailValue}>{item.actionLabel}</strong>
                      <span className={styles.detailSubtle}>· {item.actorLabel}</span>
                    </div>

                    <div className={styles.detailBlock}>
                      <span className={styles.detailLabel}>Flujo</span>
                      <strong className={`${styles.detailValue} ${styles.routeValue}`}>
                        <span>{item.route?.from || "Sin origen"}</span>
                        <ArrowRight size={14} className={styles.routeIcon} />
                        <span>{item.route?.to || "Sin destino"}</span>
                      </strong>
                    </div>
                  </div>

                  <div className={styles.previewBox}>
                    <span className={styles.previewLabel}>Detalle rápido</span>
                    <p className={styles.previewText}>{item.preview}</p>
                  </div>

                  {item.note ? <p className={styles.noteText}>{item.note}</p> : null}

                  <div className={styles.cardFooter}>
                    <Link href={item.href} className="miniAction">
                      Abrir detalle
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          <PaginationBar
            page={page}
            totalPages={totalPages}
            totalItems={filteredHistory.length}
            fromItem={fromItem}
            toItem={toItem}
            itemLabel="registros"
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
