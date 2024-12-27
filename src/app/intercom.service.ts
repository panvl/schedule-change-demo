// src/app/intercom.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of, timer } from 'rxjs';
import { retryWhen, mergeMap } from 'rxjs/operators';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class IntercomService {
  private readonly INTERCOM_TOKEN = environment.intercomToken;
  private readonly BASE_URL = '/intercom-api';

  constructor(private http: HttpClient) {}

  // Retry strategy with exponential backoff
  private retryStrategy = (maxRetry: number = 5, scalingDuration: number = 3000) => (attempts: Observable<any>) =>
    attempts.pipe(
      mergeMap((error, i) => {
        const retryAttempt = i + 1;
        if (retryAttempt > maxRetry || error.status !== 429) {
          return throwError(error);
        }
        const resetTime = error.headers.get('X-RateLimit-Reset');
        const delayDuration = resetTime
          ? Math.max(0, parseInt(resetTime) * 1000 - Date.now())
          : retryAttempt * scalingDuration;
        return timer(delayDuration);
      })
    );

  // 1. Find a contact by email
  searchContactByEmail(email: string): Observable<any> {
    const url = `${this.BASE_URL}/contacts/search`;
    const body = {
      query: {
        operator: 'AND',
        value: [
          {
            field: 'email',
            operator: '=',
            value: email
          }
        ]
      }
    };
    return this.http.post<any>(url, body, {
      headers: new HttpHeaders({
        Authorization: this.INTERCOM_TOKEN,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      })
    }).pipe(
      retryWhen(this.retryStrategy())
    );
  }

  // 2. Find conversations by contact ID
  searchConversationsByContactId(contactId: string): Observable<any> {
    const url = `${this.BASE_URL}/conversations/search`;
    const body = {
      query: {
        operator: 'AND',
        value: [
          {
            field: 'contact_ids',
            operator: '=',
            value: contactId
          }
        ]
      }
    };
    return this.http.post<any>(url, body, {
      headers: new HttpHeaders({
        Authorization: this.INTERCOM_TOKEN,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      })
    }).pipe(
      retryWhen(this.retryStrategy())
    );
  }
}
