import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CertificateBuilderComponent } from './certificate-builder.component';

describe('CertificateBuilderComponent', () => {
  let component: CertificateBuilderComponent;
  let fixture: ComponentFixture<CertificateBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CertificateBuilderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CertificateBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
