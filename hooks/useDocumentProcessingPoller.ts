import { useEffect, useRef } from 'react';
import { Document } from '@/types/Document';
import { fetchDocumentsForNote } from '@/utils/supabase';

const POLL_INTERVAL_MS = 4000;
const MAX_ATTEMPTS = 15; // 4s × 15 = 60s max

/**
 * Polls the server for document processing completion.
 * Starts polling when any document has cdn_url but no processed_at.
 * Merges server fields (processed_at, extracted_text, doc_explanation) into local state
 * while preserving local-only fields (local_uri, local_thumbnail_uri, upload_state).
 * Stops after all docs are processed, after 60s, or on unmount.
 */
export function useDocumentProcessingPoller(
  recallId: string | undefined,
  documents: Document[],
  setDocuments: (next: Document[]) => void
): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);
  const documentsRef = useRef(documents);

  // Keep ref in sync so the interval closure always sees latest docs
  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    if (!recallId) return;

    const hasPending = documents.some(d => d.cdn_url && !d.processed_at);
    if (!hasPending) return;

    console.log('[useDocumentProcessingPoller] Starting polling for recallId:', recallId);
    attemptsRef.current = 0;

    const poll = async () => {
      attemptsRef.current += 1;
      console.log(`[useDocumentProcessingPoller] Poll attempt ${attemptsRef.current}/${MAX_ATTEMPTS} for recall:`, recallId);

      try {
        const serverDocs = await fetchDocumentsForNote(recallId);
        if (!serverDocs || serverDocs.length === 0) return;

        // Build a map of server docs by id for fast lookup
        const serverMap = new Map<string, typeof serverDocs[0]>();
        for (const sd of serverDocs) {
          if (sd.id) serverMap.set(sd.id, sd);
        }

        // Merge server fields into local state
        const current = documentsRef.current;
        const updated = current.map(localDoc => {
          if (!localDoc.id) return localDoc;
          const sd = serverMap.get(localDoc.id);
          if (!sd) return localDoc;
          return {
            ...localDoc,
            // Server fields — overwrite
            processed_at: sd.processed_at ?? localDoc.processed_at,
            extracted_text: sd.extracted_text ?? localDoc.extracted_text,
            doc_explanation: sd.doc_explanation ?? localDoc.doc_explanation,
            cdn_url: sd.cdn_url ?? localDoc.cdn_url,
            thumbnail_url: sd.thumbnail_url ?? localDoc.thumbnail_url,
            page_count: sd.page_count ?? localDoc.page_count,
            // Local-only fields — preserve
            local_uri: localDoc.local_uri,
            local_thumbnail_uri: localDoc.local_thumbnail_uri,
            upload_state: localDoc.upload_state,
          };
        });

        setDocuments(updated);

        // Stop if all uploaded docs are now processed
        const allProcessed = updated.every(d => !d.cdn_url || !!d.processed_at);
        if (allProcessed) {
          console.log('[useDocumentProcessingPoller] All documents processed — stopping poll');
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return;
        }
      } catch (err) {
        console.error('[useDocumentProcessingPoller] Poll error:', err);
      }

      // Stop after max attempts
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        console.log('[useDocumentProcessingPoller] Max attempts reached — stopping poll');
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        console.log('[useDocumentProcessingPoller] Unmounting — clearing poll interval');
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // Only re-run when recallId changes or when pending status changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recallId, documents.some(d => d.cdn_url && !d.processed_at)]);
}
