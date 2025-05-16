import { Routes } from '@angular/router';
import { CertificateBuilderComponent } from './Components/certificate-builder/certificate-builder.component';

export const routes: Routes = [
    {path:'',redirectTo:'/certificate',pathMatch:'full'},
    {path:'certificate',component:CertificateBuilderComponent}
];
