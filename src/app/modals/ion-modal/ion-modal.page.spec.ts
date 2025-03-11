import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IonModalPage } from './ion-modal.page';

describe('IonModalPage', () => {
  let component: IonModalPage;
  let fixture: ComponentFixture<IonModalPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(IonModalPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
