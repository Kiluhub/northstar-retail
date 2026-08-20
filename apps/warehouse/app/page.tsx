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

export default function WarehouseDashboard() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadInventory() {
      try {
        const response = await fetch("/api/inventory");

        if (!response.ok) {
          throw new Error("Failed to load inventory");
        }

        const data = await response.json();
        setInventory(data);
      } catch (err) {
        console.error(err);
        setError("Unable to load warehouse inventory.");
      } finally {
        setLoading(false);
      }
    }

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

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
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
            <span className="mr-2 text-emerald-400">●</span>
            Inventory Service Online
          </div>
        </div>
      </header>

      {/* Main */}
      <section className="mx-auto max-w-7xl px-8 py-8">

        {/* Page heading */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold">
            Inventory Overview
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Current physical stock across Northstar fulfillment
            locations.
          </p>
        </div>

        {/* Statistics */}
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

        {/* Inventory table */}
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">

          <div className="border-b border-slate-800 px-6 py-5">
            <h3 className="font-semibold">
              Current Inventory
            </h3>

            <p className="mt-1 text-sm text-slate-400">
              Inventory synchronized from the warehouse database.
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
                  </tr>

                </thead>

                <tbody>

                  {inventory.map((item) => {

                    const available =
                      item.physicalQuantity -
                      item.reservedQuantity;

                    const isLowStock = available <= 10;

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

                      </tr>
                    );
                  })}

                </tbody>

              </table>

            </div>
          )}

        </div>

      </section>
    </main>
  );
}

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