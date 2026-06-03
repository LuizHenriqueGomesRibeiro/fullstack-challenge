import { queryOptions, useQuery } from "@tanstack/react-query";
import { gamesApi } from "../../zodios/api";

export function useHistoryQueryOptions() {
  return queryOptions({
    queryKey: ['rounds', 'history'],
    queryFn: () => gamesApi.getRoundHistory(),
  });
} 

export default function useHistoryQuery() {
  const historyQuery = useQuery(
    useHistoryQueryOptions()
  );

  return historyQuery
}