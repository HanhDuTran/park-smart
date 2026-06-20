export interface SearchSuggestion {
  mapbox_id: string;
  name: string;
  full_address: string | null;
  place_type: string;
}

export interface SearchResult {
  name: string;
  full_address: string | null;
  lat: number;
  lng: number;
  place_type: string;
}
