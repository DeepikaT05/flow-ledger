import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';

// Screens
import { LoginScreen } from '../screens/LoginScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { SaleListScreen } from '../screens/SaleListScreen';
import { SaleEntryScreen } from '../screens/SaleEntryScreen';
import { SaleDetailScreen } from '../screens/SaleDetailScreen';
import { PurchaseListScreen } from '../screens/PurchaseListScreen';
import { PurchaseEntryScreen } from '../screens/PurchaseEntryScreen';
import { PurchaseDetailScreen } from '../screens/PurchaseDetailScreen';
import { ReceiptListScreen } from '../screens/ReceiptListScreen';
import { ReceiptEntryScreen } from '../screens/ReceiptEntryScreen';
import { PaymentListScreen } from '../screens/PaymentListScreen';
import { PaymentEntryScreen } from '../screens/PaymentEntryScreen';
import { ContraListScreen } from '../screens/ContraListScreen';
import { ContraEntryScreen } from '../screens/ContraEntryScreen';
import { LedgerListScreen } from '../screens/LedgerListScreen';
import { LedgerStatementScreen } from '../screens/LedgerStatementScreen';
import { LedgerEntryScreen } from '../screens/LedgerEntryScreen';

const Stack = createNativeStackNavigator();

export const AppNavigator: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#002244' }}>
        <ActivityIndicator size="large" color="#ffcc00" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Dashboard" component={DashboardScreen} />

            {/* Sale Module */}
            <Stack.Screen name="SaleList" component={SaleListScreen} />
            <Stack.Screen name="SaleEntry" component={SaleEntryScreen} />
            <Stack.Screen name="SaleDetail" component={SaleDetailScreen} />

            {/* Purchase Module */}
            <Stack.Screen name="PurchaseList" component={PurchaseListScreen} />
            <Stack.Screen name="PurchaseEntry" component={PurchaseEntryScreen} />
            <Stack.Screen name="PurchaseDetail" component={PurchaseDetailScreen} />

            {/* Receipt Module */}
            <Stack.Screen name="ReceiptList" component={ReceiptListScreen} />
            <Stack.Screen name="ReceiptEntry" component={ReceiptEntryScreen} />

            {/* Payment Module */}
            <Stack.Screen name="PaymentList" component={PaymentListScreen} />
            <Stack.Screen name="PaymentEntry" component={PaymentEntryScreen} />

            {/* Contra Module */}
            <Stack.Screen name="ContraList" component={ContraListScreen} />
            <Stack.Screen name="ContraEntry" component={ContraEntryScreen} />

            {/* Ledger Module */}
            <Stack.Screen name="LedgerList" component={LedgerListScreen} />
            <Stack.Screen name="LedgerStatement" component={LedgerStatementScreen} />
            <Stack.Screen name="LedgerEntry" component={LedgerEntryScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
