"use client";

import { useEffect, useState } from "react";

type InventoryItem = {
  id: string;
  physicalQuantity: number;
  reservedQuantity: number;
  product: {
    sku: string;
    name: string;
  };
  warehouse: {
    code: string;
    name: string;
  };
};

type Operation = "receive" | "pick" | "ship" | "adjust";

export default function WarehouseDashboard() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [operation, setOperation] = useState<Operation | null>(null);
  const [selectedItem, setSelectedItem] =
    useState<InventoryItem | null>(null);

  const [quantity, setQuantity] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadInventory() {
    try {
      setLoading(true);

      const response = await fetch("/api/inventory");

      if (!response.ok) {
        throw new Error("Failed to load inventory");
      }

      const data = await response.json();
      setInventory(data);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Unable to load warehouse inventory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInventory();
  }, []);

  const warehouses = new Set(
    inventory.map((item) => item.warehouse.code)
  ).size;

  const products = new Set(
    inventory.map((item) => item.product.sku)
  ).size;

  const lowStock = inventory.filter((item) => {
    const available =
      item.physicalQuantity - item.reservedQuantity;

    return available <= 10;
  }).length;

  function openOperation(
    type: Operation,
    item: InventoryItem
  ) {
    setOperation(type);
    setSelectedItem(item);
    setQuantity("");
    setReference("");
    setReason("");
  }

  function closeOperation() {
    if (submitting) return;

    setOperation(null);
    setSelectedItem(null);
    setQuantity("");
    setReference("");
    setReason("");
  }

  async function submitOperation() {
    if (!selectedItem || !operation) return;

    const parsedQuantity = Number(quantity);

    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      alert("Enter a valid positive quantity.");
      return;
    }

    setSubmitting(true);

    try {
      let quantityDelta = parsedQuantity;

      if (
        operation === "pick" ||
        operation === "ship"
      ) {
        quantityDelta = -parsedQuantity;
      }

      if (operation === "adjust") {
        quantityDelta =
          parsedQuantity -
          selectedItem.physicalQuantity;
      }

      const response = await fetch(
        "/api/inventory/events",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            warehouseId: selectedItem.warehouse.code,
            productId: selectedItem.product.sku,
            quantityDelta,
            operation,
            reference: reference || null,
            reason: reason || null,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);

        throw new Error(
          data?.error || "Failed to submit inventory operation."
        );
      }

      closeOperation();

      await loadInventory();

    } catch (err) {
      console.error(err);

      alert(
        err instanceof Error
          ? err.message
          : "Inventory operation failed."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">

      {/* HEADER */}
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-5">

          <div>
            <p className="text-sm font-semibold tracking-wider text-blue-400">
              NORTHSTAR RETAIL
            </p>

            <h1 className="mt-1 text-2xl font-bold">
              Warehouse Operations
            </h1>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm">
            <span className="mr-2 text-emerald-400">
              ●
            </span>

            Inventory Service Online
          </div>

        </div>
      </header>

      {/* MAIN */}
      <section className="mx-auto max-w-7xl px-8 py-8">

        <div className="mb-8">
          <h2 className="text-xl font-semibold">
            Warehouse Operations
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Record physical warehouse operations and monitor
            synchronized inventory.
          </p>
        </div>

        {/* OPERATION BUTTONS */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">

          <OperationCard
            title="Receive Stock"
            description="Record incoming goods."
            onClick={() => {
              if (inventory.length > 0) {
                openOperation("receive", inventory[0]);
              }
            }}
          />

          <OperationCard
            title="Pick Stock"
            description="Record goods picked for an order."
            onClick={() => {
              if (inventory.length > 0) {
                openOperation("pick", inventory[0]);
              }
            }}
          />

          <OperationCard
            title="Ship Stock"
            description="Record goods leaving the warehouse."
            onClick={() => {
              if (inventory.length > 0) {
                openOperation("ship", inventory[0]);
              }
            }}
          />

          <OperationCard
            title="Stock Adjustment"
            description="Correct a physical stock count."
            onClick={() => {
              if (inventory.length > 0) {
                openOperation("adjust", inventory[0]);
              }
            }}
          />

        </div>

        {/* STATISTICS */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <StatCard
            title="Inventory Records"
            value={inventory.length}
          />

          <StatCard
            title="Warehouses"
            value={warehouses}
          />

          <StatCard
            title="Products"
            value={products}
          />

          <StatCard
            title="Low Stock"
            value={lowStock}
          />

        </div>

        {/* INVENTORY TABLE */}
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">

          <div className="border-b border-slate-800 px-6 py-5">

            <h3 className="font-semibold">
              Current Inventory
            </h3>

            <p className="mt-1 text-sm text-slate-400">
              Select an inventory record to perform a warehouse
              operation.
            </p>

          </div>

          {loading && (
            <div className="px-6 py-10 text-center text-slate-400">
              Loading inventory...
            </div>
          )}

          {error && (
            <div className="px-6 py-10 text-center text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="overflow-x-auto">

              <table className="w-full text-left text-sm">

                <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">

                  <tr>
                    <th className="px-6 py-4">
                      Warehouse
                    </th>

                    <th className="px-6 py-4">
                      SKU
                    </th>

                    <th className="px-6 py-4">
                      Product
                    </th>

                    <th className="px-6 py-4">
                      Physical
                    </th>

                    <th className="px-6 py-4">
                      Reserved
                    </th>

                    <th className="px-6 py-4">
                      Available
                    </th>

                    <th className="px-6 py-4">
                      Status
                    </th>

                    <th className="px-6 py-4">
                      Operations
                    </th>
                  </tr>

                </thead>

                <tbody>

                  {inventory.map((item) => {

                    const available =
                      item.physicalQuantity -
                      item.reservedQuantity;

                    const isLowStock =
                      available <= 10;

                    return (
                      <tr
                        key={item.id}
                        className="border-t border-slate-800 hover:bg-slate-800/50"
                      >

                        <td className="px-6 py-4">
                          <div className="font-medium">
                            {item.warehouse.code}
                          </div>

                          <div className="text-xs text-slate-500">
                            {item.warehouse.name}
                          </div>
                        </td>

                        <td className="px-6 py-4 font-mono text-blue-400">
                          {item.product.sku}
                        </td>

                        <td className="px-6 py-4">
                          {item.product.name}
                        </td>

                        <td className="px-6 py-4">
                          {item.physicalQuantity}
                        </td>

                        <td className="px-6 py-4 text-slate-400">
                          {item.reservedQuantity}
                        </td>

                        <td className="px-6 py-4 font-semibold">
                          {available}
                        </td>

                        <td className="px-6 py-4">

                          {isLowStock ? (
                            <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
                              Low Stock
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                              In Stock
                            </span>
                          )}

                        </td>

                        <td className="px-6 py-4">

                          <div className="flex gap-2">

                            <button
                              onClick={() =>
                                openOperation(
                                  "receive",
                                  item
                                )
                              }
                              className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium hover:bg-emerald-500"
                            >
                              Receive
                            </button>

                            <button
                              onClick={() =>
                                openOperation(
                                  "pick",
                                  item
                                )
                              }
                              className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium hover:bg-blue-500"
                            >
                              Pick
                            </button>

                            <button
                              onClick={() =>
                                openOperation(
                                  "ship",
                                  item
                                )
                              }
                              className="rounded-md bg-purple-600 px-3 py-2 text-xs font-medium hover:bg-purple-500"
                            >
                              Ship
                            </button>

                            <button
                              onClick={() =>
                                openOperation(
                                  "adjust",
                                  item
                                )
                              }
                              className="rounded-md border border-slate-700 px-3 py-2 text-xs font-medium hover:bg-slate-800"
                            >
                              Adjust
                            </button>

                          </div>

                        </td>

                      </tr>
                    );
                  })}

                </tbody>

              </table>

            </div>
          )}

        </div>

      </section>

      {/* OPERATION MODAL */}
      {operation && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">

          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">

            <div className="mb-6">

              <h2 className="text-xl font-bold">
                {operation === "receive" &&
                  "Receive Stock"}

                {operation === "pick" &&
                  "Pick Stock"}

                {operation === "ship" &&
                  "Ship Stock"}

                {operation === "adjust" &&
                  "Stock Adjustment"}
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                {selectedItem.product.name} ·{" "}
                {selectedItem.product.sku}
              </p>

            </div>

            {/* CURRENT STOCK */}
            <div className="mb-5 rounded-lg border border-slate-800 bg-slate-950 p-4">

              <p className="text-xs uppercase text-slate-500">
                Current Physical Stock
              </p>

              <p className="mt-1 text-2xl font-bold">
                {selectedItem.physicalQuantity}
              </p>

            </div>

            {/* QUANTITY */}
            <label className="block text-sm font-medium">

              {operation === "adjust"
                ? "New Physical Quantity"
                : "Quantity"}

              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) =>
                  setQuantity(e.target.value)
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
                placeholder="Enter quantity"
              />

            </label>

            {/* REFERENCE */}
            <label className="mt-4 block text-sm font-medium">

              Reference

              <input
                value={reference}
                onChange={(e) =>
                  setReference(e.target.value)
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
                placeholder="PO-2026-001 / ORDER-123"
              />

            </label>

            {/* REASON */}
            <label className="mt-4 block text-sm font-medium">

              Reason

              <input
                value={reason}
                onChange={(e) =>
                  setReason(e.target.value)
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
                placeholder="Supplier delivery / customer order"
              />

            </label>

            {/* BUTTONS */}
            <div className="mt-6 flex justify-end gap-3">

              <button
                onClick={closeOperation}
                disabled={submitting}
                className="rounded-lg border border-slate-700 px-5 py-3 text-sm hover:bg-slate-800"
              >
                Cancel
              </button>

              <button
                onClick={submitOperation}
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
              >
                {submitting
                  ? "Submitting..."
                  : "Confirm Operation"}
              </button>

            </div>

          </div>

        </div>
      )}

    </main>
  );
}

/* STAT CARD */

function StatCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">

      <p className="text-sm text-slate-400">
        {title}
      </p>

      <p className="mt-2 text-3xl font-bold">
        {value}
      </p>

    </div>
  );
}

/* OPERATION CARD */

function OperationCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-left transition hover:border-blue-500 hover:bg-slate-800"
    >

      <h3 className="font-semibold">
        {title}
      </h3>

      <p className="mt-2 text-sm text-slate-400">
        {description}
      </p>

      <p className="mt-4 text-xs font-semibold text-blue-400">
        OPEN OPERATION →
      </p>

    </button>
  );
}