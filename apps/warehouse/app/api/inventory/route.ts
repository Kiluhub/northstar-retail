import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
export async function GET() {
  try {
    const inventory = await prisma.inventory.findMany({
      include: {
        product: true,
        warehouse: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return NextResponse.json(inventory);
  } catch (error) {
    console.error("Inventory fetch failed:", error);

    return NextResponse.json(
      { error: "Failed to fetch inventory" },
      { status: 500 }
    );
  }
}