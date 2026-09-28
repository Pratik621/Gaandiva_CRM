/** Sr. No. for Ant Design Table when using client-side pagination. */
export function tableSerialNumber(
  page: number,
  pageSize: number,
  rowIndex: number
): number {
  return (Math.max(1, page) - 1) * Math.max(1, pageSize) + rowIndex + 1;
}
