import { useQuery, type QueryKey, type UseQueryOptions } from "@tanstack/react-query";

type SupabaseQueryFn<T> = () => Promise<T>;

type Options<TData> = Omit<UseQueryOptions<TData, Error, TData, QueryKey>, "queryKey" | "queryFn">;

export function useSupabaseQuery<TData>(
  queryKey: QueryKey,
  queryFn: SupabaseQueryFn<TData>,
  options?: Options<TData>
) {
  return useQuery<TData, Error>({
    queryKey,
    queryFn: async () => {
      try {
        return await queryFn();
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
        throw new Error("Unknown Supabase query error");
      }
    },
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
    ...options,
  });
}



